import "dotenv/config";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createClient } from "@supabase/supabase-js";
import { validateToken, createUserClient } from "./auth.js";
import { registerAllTools } from "./register-tools.js";
import { createOAuthRouter } from "./oauth.js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const port = parseInt(process.env.PORT ?? "3001", 10);
const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const app = express();
app.use(cors());
app.use(express.json());

// Mount OAuth 2.1 endpoints (/.well-known/*, /authorize, /token, /revoke)
app.use(createOAuthRouter(supabaseUrl, supabaseAnonKey, supabaseServiceKey, baseUrl));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "oep-timetrack-mcp-gateway" });
});

// --- Stateless MCP handler ---
// Each request creates a fresh McpServer + transport (no session persistence).
// Compatible with serverless (Vercel) and long-running (local) environments.

app.post("/mcp", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const token = authHeader.slice(7);

  const user = await validateToken(adminClient, token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const userSupabase = createUserClient(supabaseUrl, supabaseAnonKey, token);

  const mcpServer = new McpServer({
    name: "oep-timetrack-gateway",
    version: "1.0.0",
  });
  registerAllTools(mcpServer, userSupabase);

  // Stateless: no session ID generator → each request is self-contained
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined as any,
  });

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
  await transport.close();
  await mcpServer.close();
});

app.get("/mcp", async (req, res) => {
  // SSE endpoint — not supported in stateless mode
  res.status(405).json({ error: "SSE not supported in stateless mode" });
});

app.delete("/mcp", async (req, res) => {
  // Session termination — not applicable in stateless mode
  res.status(200).json({ status: "ok" });
});

// --- Start server (local dev) or export for Vercel ---
if (!process.env.VERCEL) {
  app.listen(port, "0.0.0.0", () => {
    console.error(`OEP TimeTrack MCP Gateway listening on http://0.0.0.0:${port}`);
    console.error(`MCP endpoint: http://localhost:${port}/mcp`);
    console.error(`OAuth: http://localhost:${port}/.well-known/oauth-authorization-server`);
  });
}

export default app;
