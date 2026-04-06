import express from "express";
import { randomUUID, createHash } from "crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { loginPage, mfaPage } from "./templates.js";
import { storeAuthCode, consumeAuthCode, storeTempSession, consumeTempSession, storeSession, checkAndUpdateSession } from "./state.js";

export function createOAuthRouter(
  supabaseUrl: string,
  supabaseAnonKey: string,
  supabaseServiceKey: string,
  baseUrl: string
): express.Router {
  const router = express.Router();

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- Discovery endpoints ---

  router.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/token`,
      revocation_endpoint: `${baseUrl}/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      registration_endpoint: `${baseUrl}/register`,
    });
  });

  router.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ["header"],
    });
  });

  // --- Dynamic client registration (RFC 7591) ---

  router.post("/register", express.json(), (req, res) => {
    const { client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method } = req.body;

    const clientId = randomUUID();

    res.status(201).json({
      client_id: clientId,
      client_name: client_name ?? "mcp-client",
      redirect_uris: redirect_uris ?? [],
      grant_types: grant_types ?? ["authorization_code", "refresh_token"],
      response_types: response_types ?? ["code"],
      token_endpoint_auth_method: token_endpoint_auth_method ?? "none",
    });
  });

  // --- Authorization endpoint ---

  router.get("/authorize", (req, res) => {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type } = req.query as Record<string, string>;

    if (response_type !== "code") {
      res.status(400).json({ error: "unsupported_response_type", error_description: "Only response_type=code is supported" });
      return;
    }
    if (!code_challenge || code_challenge_method !== "S256") {
      res.status(400).json({ error: "invalid_request", error_description: "PKCE with S256 is required" });
      return;
    }
    if (!redirect_uri) {
      res.status(400).json({ error: "invalid_request", error_description: "redirect_uri is required" });
      return;
    }

    res.type("html").send(loginPage({
      clientId: client_id ?? "",
      redirectUri: redirect_uri,
      state: state ?? "",
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
    }));
  });

  router.post("/authorize", express.urlencoded({ extended: false }), async (req, res) => {
    const { email, password, client_id, redirect_uri, state, code_challenge, code_challenge_method } = req.body;

    const renderError = (error: string) => {
      res.type("html").send(loginPage({
        clientId: client_id ?? "",
        redirectUri: redirect_uri ?? "",
        state: state ?? "",
        codeChallenge: code_challenge ?? "",
        codeChallengeMethod: code_challenge_method ?? "",
        error,
      }));
    };

    if (!email || !password) {
      renderError("Email and password are required.");
      return;
    }

    try {
      const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data, error } = await tempClient.auth.signInWithPassword({ email, password });
      if (error) {
        renderError(error.message);
        return;
      }

      const session = data.session;
      if (!session) {
        renderError("Authentication failed — no session returned.");
        return;
      }

      // Check if MFA is required
      const { data: factors } = await tempClient.auth.mfa.listFactors();
      const totpFactors = (factors?.totp ?? []).filter((f: any) => f.status === "verified");

      if (totpFactors.length > 0) {
        const tempId = randomUUID();
        await storeTempSession(adminClient, tempId, {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          factorId: totpFactors[0].id,
        });

        res.type("html").send(mfaPage({
          tempSessionId: tempId,
          clientId: client_id ?? "",
          redirectUri: redirect_uri ?? "",
          state: state ?? "",
          codeChallenge: code_challenge ?? "",
          codeChallengeMethod: code_challenge_method ?? "",
        }));
        return;
      }

      // No MFA — issue auth code directly
      const code = randomUUID();
      await storeAuthCode(adminClient, code, {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
        redirectUri: redirect_uri,
      });

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set("code", code);
      if (state) redirectUrl.searchParams.set("state", state);
      res.redirect(redirectUrl.toString());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      renderError(`Server error: ${message}`);
    }
  });

  // POST /authorize/mfa — handle TOTP verification
  router.post("/authorize/mfa", express.urlencoded({ extended: false }), async (req, res) => {
    const { totp_code, temp_session_id, client_id, redirect_uri, state, code_challenge, code_challenge_method } = req.body;

    const renderError = (error: string) => {
      res.type("html").send(mfaPage({
        tempSessionId: temp_session_id ?? "",
        clientId: client_id ?? "",
        redirectUri: redirect_uri ?? "",
        state: state ?? "",
        codeChallenge: code_challenge ?? "",
        codeChallengeMethod: code_challenge_method ?? "",
        error,
      }));
    };

    const tempSession = await consumeTempSession(adminClient, temp_session_id);
    if (!tempSession) {
      renderError("Session expired. Please start over.");
      return;
    }

    try {
      const mfaClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: { Authorization: `Bearer ${tempSession.access_token}` },
        },
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: challengeData, error: challengeError } = await mfaClient.auth.mfa.challenge({
        factorId: tempSession.factor_id,
      });
      if (challengeError) {
        renderError(`MFA challenge failed: ${challengeError.message}`);
        return;
      }

      const { data: verifyData, error: verifyError } = await mfaClient.auth.mfa.verify({
        factorId: tempSession.factor_id,
        challengeId: challengeData.id,
        code: totp_code,
      });
      if (verifyError) {
        // Re-store temp session so user can retry
        await storeTempSession(adminClient, temp_session_id, {
          accessToken: tempSession.access_token,
          refreshToken: tempSession.refresh_token,
          factorId: tempSession.factor_id,
        });
        renderError("Invalid verification code. Please try again.");
        return;
      }

      const code = randomUUID();
      await storeAuthCode(adminClient, code, {
        accessToken: verifyData.access_token ?? tempSession.access_token,
        refreshToken: verifyData.refresh_token ?? tempSession.refresh_token,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
        redirectUri: redirect_uri,
      });

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set("code", code);
      if (state) redirectUrl.searchParams.set("state", state);
      res.redirect(redirectUrl.toString());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      renderError(`Server error: ${message}`);
    }
  });

  // --- Token endpoint ---

  router.post("/token", express.json(), express.urlencoded({ extended: false }), async (req, res) => {
    const grantType = req.body.grant_type;

    if (grantType === "authorization_code") {
      const { code, code_verifier, redirect_uri } = req.body;

      const entry = await consumeAuthCode(adminClient, code);
      if (!entry) {
        res.status(400).json({ error: "invalid_grant", error_description: "Authorization code is invalid or expired" });
        return;
      }

      if (redirect_uri !== entry.redirect_uri) {
        res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
        return;
      }

      if (!code_verifier) {
        res.status(400).json({ error: "invalid_request", error_description: "code_verifier is required" });
        return;
      }

      const expectedChallenge = base64UrlEncode(
        createHash("sha256").update(code_verifier).digest()
      );
      if (expectedChallenge !== entry.code_challenge) {
        res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
        return;
      }

      // Track session for 48h re-auth enforcement on non-desktop clients
      const userAgent = req.headers["user-agent"] ?? "";
      await storeSession(adminClient, entry.refresh_token, userAgent);

      res.json({
        access_token: entry.access_token,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: entry.refresh_token,
      });

    } else if (grantType === "refresh_token") {
      const { refresh_token } = req.body;
      if (!refresh_token) {
        res.status(400).json({ error: "invalid_request", error_description: "refresh_token is required" });
        return;
      }

      try {
        const refreshClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data, error } = await refreshClient.auth.refreshSession({ refresh_token });
        if (error || !data.session) {
          res.status(400).json({ error: "invalid_grant", error_description: error?.message ?? "Refresh failed" });
          return;
        }

        // Enforce 48h re-auth for non-desktop clients
        const sessionCheck = await checkAndUpdateSession(adminClient, refresh_token, data.session.refresh_token);
        if (!sessionCheck.valid) {
          res.status(400).json({ error: "invalid_grant", error_description: "Session expired. Please re-authenticate." });
          return;
        }

        res.json({
          access_token: data.session.access_token,
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: data.session.refresh_token,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "server_error", error_description: message });
      }

    } else {
      res.status(400).json({ error: "unsupported_grant_type" });
    }
  });

  // --- Revocation endpoint ---

  router.post("/revoke", express.json(), express.urlencoded({ extended: false }), async (req, res) => {
    const { token } = req.body;
    if (token) {
      try {
        await adminClient.auth.admin.signOut(token, "global");
      } catch {
        // Revocation is best-effort per RFC 7009
      }
    }
    res.status(200).json({});
  });

  return router;
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
