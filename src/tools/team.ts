import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export function registerTeamTool(server: McpServer, supabase: SupabaseClient) {
  server.tool(
    "get_team_roster",
    "Get the OEP team roster with practice area assignments. Use this to understand who is on the team and their roles.",
    {
      active_only: z
        .boolean()
        .default(true)
        .describe("If true, only return active team members"),
    },
    async ({ active_only }) => {
      try {
        let query = supabase
          .from("team_members")
          .select(
            `id, first_name, last_name, email, is_active,
             team_member_metadata(practice_area:practice_areas(name))`
          )
          .order("last_name");

        if (active_only) {
          query = query.eq("is_active", true);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        const roster = (data ?? []).map((m: any) => ({
          name: `${m.first_name} ${m.last_name}`,
          email: m.email,
          practiceArea:
            m.team_member_metadata?.[0]?.practice_area?.name ?? null,
          isActive: m.is_active,
        }));

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(roster, null, 2) },
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
