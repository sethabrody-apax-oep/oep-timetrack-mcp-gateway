import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuthCodeRow {
  id: string;
  access_token: string;
  refresh_token: string;
  code_challenge: string;
  code_challenge_method: string;
  redirect_uri: string;
}

export interface TempSessionRow {
  id: string;
  access_token: string;
  refresh_token: string;
  factor_id: string;
}

export async function storeAuthCode(
  adminClient: SupabaseClient,
  code: string,
  data: {
    accessToken: string;
    refreshToken: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    redirectUri: string;
  }
): Promise<void> {
  const { error } = await adminClient.from("mcp_gateway_oauth_state").insert({
    id: code,
    kind: "auth_code",
    access_token: data.accessToken,
    refresh_token: data.refreshToken,
    code_challenge: data.codeChallenge,
    code_challenge_method: data.codeChallengeMethod,
    redirect_uri: data.redirectUri,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(`Failed to store auth code: ${error.message}`);
}

export async function consumeAuthCode(
  adminClient: SupabaseClient,
  code: string
): Promise<AuthCodeRow | null> {
  const { data, error } = await adminClient
    .from("mcp_gateway_oauth_state")
    .delete()
    .eq("id", code)
    .eq("kind", "auth_code")
    .gt("expires_at", new Date().toISOString())
    .select("id, access_token, refresh_token, code_challenge, code_challenge_method, redirect_uri")
    .maybeSingle();
  if (error) throw new Error(`Failed to consume auth code: ${error.message}`);
  return data;
}

export async function storeTempSession(
  adminClient: SupabaseClient,
  id: string,
  data: {
    accessToken: string;
    refreshToken: string;
    factorId: string;
  }
): Promise<void> {
  const { error } = await adminClient.from("mcp_gateway_oauth_state").insert({
    id,
    kind: "temp_session",
    access_token: data.accessToken,
    refresh_token: data.refreshToken,
    factor_id: data.factorId,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(`Failed to store temp session: ${error.message}`);
}

export async function consumeTempSession(
  adminClient: SupabaseClient,
  id: string
): Promise<TempSessionRow | null> {
  const { data, error } = await adminClient
    .from("mcp_gateway_oauth_state")
    .delete()
    .eq("id", id)
    .eq("kind", "temp_session")
    .gt("expires_at", new Date().toISOString())
    .select("id, access_token, refresh_token, factor_id")
    .maybeSingle();
  if (error) throw new Error(`Failed to consume temp session: ${error.message}`);
  return data;
}

export async function storeSession(
  adminClient: SupabaseClient,
  refreshToken: string,
  userAgent: string
): Promise<void> {
  const isDesktop = /node/i.test(userAgent);
  // Desktop: no expiry (set far future). Non-desktop: 48 hours.
  const expiresAt = isDesktop
    ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const { error } = await adminClient.from("mcp_gateway_oauth_state").insert({
    kind: "session",
    refresh_token: refreshToken,
    access_token: userAgent,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`Failed to store session: ${error.message}`);
}

export async function checkAndUpdateSession(
  adminClient: SupabaseClient,
  oldRefreshToken: string,
  newRefreshToken: string
): Promise<{ valid: boolean }> {
  // Look up session by refresh token
  const { data, error } = await adminClient
    .from("mcp_gateway_oauth_state")
    .select("id, expires_at")
    .eq("kind", "session")
    .eq("refresh_token", oldRefreshToken)
    .maybeSingle();

  if (error) throw new Error(`Failed to check session: ${error.message}`);

  // No session row = legacy token issued before this feature, allow it
  if (!data) return { valid: true };

  // Check if session has expired (48h for non-desktop)
  if (new Date(data.expires_at) < new Date()) {
    await adminClient
      .from("mcp_gateway_oauth_state")
      .delete()
      .eq("id", data.id);
    return { valid: false };
  }

  // Update refresh token for next cycle
  await adminClient
    .from("mcp_gateway_oauth_state")
    .update({ refresh_token: newRefreshToken })
    .eq("id", data.id);

  return { valid: true };
}

export async function cleanupExpired(adminClient: SupabaseClient): Promise<void> {
  await adminClient
    .from("mcp_gateway_oauth_state")
    .delete()
    .lt("expires_at", new Date().toISOString());
}
