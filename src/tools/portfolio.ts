import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { paginatedFetch } from "../utils/pagination.js";
import {
  isDueDiligenceProject,
  isExcludedClient,
  daysAgo,
  todayStr,
} from "../utils/filters.js";

interface TimeEntry {
  hours: number;
  project: {
    name: string;
    client: { name: string } | null;
  } | null;
  team_member: {
    first_name: string;
    last_name: string;
  } | null;
}

export function registerPortfolioTool(server: McpServer, supabase: SupabaseClient) {
  server.tool(
    "get_portfolio_engagements",
    "Get top portfolio company engagements ranked by total days. Excludes DD projects and non-portfolio clients.",
    {
      days_back: z
        .number()
        .default(90)
        .describe("Number of days to look back"),
      top_n: z
        .number()
        .default(15)
        .describe("Number of top clients to return"),
      reference_date: z
        .string()
        .default(todayStr())
        .describe("Reference date in YYYY-MM-DD format"),
    },
    async ({ days_back, top_n, reference_date }) => {
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

        const filtered = entries.filter(
          (e) =>
            e.project?.client?.name &&
            !isDueDiligenceProject(e.project.name) &&
            !isExcludedClient(e.project.client.name)
        );

        const clientMap = new Map<
          string,
          { totalDays: number; memberMap: Map<string, number> }
        >();

        for (const e of filtered) {
          const clientName = e.project!.client!.name;
          if (!clientMap.has(clientName)) {
            clientMap.set(clientName, { totalDays: 0, memberMap: new Map() });
          }
          const client = clientMap.get(clientName)!;
          client.totalDays += e.hours;

          if (e.team_member) {
            const name = `${e.team_member.first_name} ${e.team_member.last_name}`;
            client.memberMap.set(
              name,
              (client.memberMap.get(name) ?? 0) + e.hours
            );
          }
        }

        const result = Array.from(clientMap.entries())
          .map(([clientName, data]) => ({
            clientName,
            totalDays: Math.round(data.totalDays * 100) / 100,
            teamMembers: Array.from(data.memberMap.entries())
              .map(([name, days]) => ({
                name,
                days: Math.round(days * 100) / 100,
              }))
              .sort((a, b) => b.days - a.days),
          }))
          .sort((a, b) => b.totalDays - a.totalDays)
          .slice(0, top_n);

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
