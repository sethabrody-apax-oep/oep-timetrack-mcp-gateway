import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export function registerSqlTool(server: McpServer, supabase: SupabaseClient) {
  server.tool(
    "run_sql_query",
    "Run a read-only SQL query against the OEP TimeTrack database. Only SELECT/WITH/EXPLAIN queries are allowed. Key tables: time_entries, team_members, projects, clients, project_metadata, sectors, portfolio_geos, subsectors, deal_partner_hubs, project_groups, project_group_members, practice_areas, team_member_metadata.",
    {
      sql: z
        .string()
        .describe("A read-only SQL query (SELECT, WITH, or EXPLAIN only)"),
    },
    async ({ sql }) => {
      try {
        const trimmed = sql.trim().toLowerCase();
        if (
          !trimmed.startsWith("select") &&
          !trimmed.startsWith("with") &&
          !trimmed.startsWith("explain")
        ) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Only SELECT, WITH (CTE), and EXPLAIN queries are allowed.",
              },
            ],
          };
        }

        const { data, error } = await supabase.rpc("run_readonly_query", {
          query_text: sql,
        });
        if (error) throw new Error(error.message);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
        };
      }
    }
  );
}
