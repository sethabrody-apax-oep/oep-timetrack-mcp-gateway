import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  supabase: SupabaseClient;
  userId: string;
  createdAt: number;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function setSession(sessionId: string, session: Session): void {
  sessions.set(sessionId, session);
}

export function touchSession(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (s) s.lastActivity = Date.now();
}

export async function deleteSession(sessionId: string): Promise<void> {
  const s = sessions.get(sessionId);
  if (s) {
    await s.transport.close();
    sessions.delete(sessionId);
  }
}

export function startCleanupTimer(maxIdleMs = 30 * 60 * 1000): NodeJS.Timeout {
  return setInterval(async () => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (now - s.lastActivity > maxIdleMs) {
        console.error(`Evicting idle session ${id} (user ${s.userId})`);
        await deleteSession(id);
      }
    }
  }, 5 * 60 * 1000);
}
