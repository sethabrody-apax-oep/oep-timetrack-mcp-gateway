import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { paginatedFetch } from "../utils/pagination.js";
import { daysAgo, todayStr } from "../utils/filters.js";

interface TimeEntry {
  hours: number;
  project: { name: string; client: { name: string } | null } | null;
  team_member: { first_name: string; last_name: string } | null;
}

export function registerSummaryTool(server: McpServer, supabase: SupabaseClient) {
  server.tool(
    "get_time_summary",
    "Get a generic aggregation of time entries grouped by client, project, or team member. Returns total days and entry count per group.",
    {
      days_back: z.number().default(90).describe("Number of days to look back"),
      reference_date: z
        .string()
        .default(todayStr())
        .describe("Reference date in YYYY-MM-DD format"),
      group_by: z
        .enum(["client", "project", "team_member"])
        .default("client")
        .describe("Dimension to group results by"),
    },
    async ({ days_back, reference_date, group_by }) => {
      try {
        const startDate = daysAgo(days_back, reference_date);

        const entries = await paginatedFetch<TimeEntry>((from, to) =>
          supabase
            .from("time_entries")
            .select(
              `hours,
               project:projects(name, client:clients(name)),
               team_member:team_members(first_name, last_name)`
            )
            .gte("spent_date", startDate)
            .lte("spent_date", reference_date)
            .range(from, to)
        );

        const groups = new Map<
          string,
          { totalDays: number; entryCount: number }
        >();

        for (const e of entries) {
          let key: string;
          switch (group_by) {
            case "client":
              key = e.project?.client?.name ?? "Unknown";
              break;
            case "project":
              key = e.project?.name ?? "Unknown";
              break;
            case "team_member":
              key = e.team_member
                ? `${e.team_member.first_name} ${e.team_member.last_name}`
                : "Unknown";
              break;
          }
          if (!groups.has(key)) {
            groups.set(key, { totalDays: 0, entryCount: 0 });
          }
          const g = groups.get(key)!;
          g.totalDays += e.hours;
          g.entryCount += 1;
        }

        const result = Array.from(groups.entries())
          .map(([name, data]) => ({
            name,
            totalDays: Math.round(data.totalDays * 100) / 100,
            entryCount: data.entryCount,
          }))
          .sort((a, b) => b.totalDays - a.totalDays);

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
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
