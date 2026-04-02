import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { paginatedFetch } from "../utils/pagination.js";
import {
  isDueDiligenceProject,
  isDueDiligenceEntry,
  parseDealName,
  daysAgo,
  todayStr,
} from "../utils/filters.js";

interface TimeEntry {
  hours: number;
  notes: string | null;
  project: {
    name: string;
    client: { name: string } | null;
  } | null;
  team_member: {
    first_name: string;
    last_name: string;
  } | null;
}

export function registerDealsTool(server: McpServer, supabase: SupabaseClient) {
  server.tool(
    "get_deals_and_diligence",
    "Get active deals and due diligence activity. Shows deal names parsed from time entry notes, team members involved, and total days spent per deal.",
    {
      days_back: z
        .number()
        .default(30)
        .describe("Number of days to look back from reference_date"),
      reference_date: z
        .string()
        .default(todayStr())
        .describe("Reference date in YYYY-MM-DD format (default today)"),
    },
    async ({ days_back, reference_date }) => {
      try {
        const startDate = daysAgo(days_back, reference_date);

        const entries = await paginatedFetch<TimeEntry>((from, to) =>
          supabase
            .from("time_entries")
            .select(
              `hours, notes,
               project:projects(name, client:clients(name)),
               team_member:team_members(first_name, last_name)`
            )
            .gte("spent_date", startDate)
            .lte("spent_date", reference_date)
            .range(from, to)
        );

        const ddEntries = entries.filter(
          (e) =>
            e.project &&
            isDueDiligenceProject(e.project.name) &&
            e.notes &&
            isDueDiligenceEntry(e.notes)
        );

        const dealMap = new Map<
          string,
          {
            dealName: string;
            projectName: string;
            clientName: string;
            totalDays: number;
            memberMap: Map<string, number>;
          }
        >();

        for (const e of ddEntries) {
          const dealName = parseDealName(e.notes!);
          if (!dealName) continue;

          const key = dealName.toLowerCase();
          if (!dealMap.has(key)) {
            dealMap.set(key, {
              dealName,
              projectName: e.project!.name,
              clientName: e.project!.client?.name ?? "Unknown",
              totalDays: 0,
              memberMap: new Map(),
            });
          }

          const deal = dealMap.get(key)!;
          deal.totalDays += e.hours;

          if (e.team_member) {
            const name = `${e.team_member.first_name} ${e.team_member.last_name}`;
            deal.memberMap.set(name, (deal.memberMap.get(name) ?? 0) + e.hours);
          }
        }

        const result = Array.from(dealMap.values())
          .map((d) => ({
            dealName: d.dealName,
            projectName: d.projectName,
            clientName: d.clientName,
            totalDays: Math.round(d.totalDays * 100) / 100,
            teamMembers: Array.from(d.memberMap.entries())
              .map(([name, days]) => ({
                name,
                days: Math.round(days * 100) / 100,
              }))
              .sort((a, b) => b.days - a.days),
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
