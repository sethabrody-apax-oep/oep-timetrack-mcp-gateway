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
  spent_date: string;
  project: {
    id: string;
    name: string;
    client: { name: string } | null;
  } | null;
  team_member: {
    first_name: string;
    last_name: string;
  } | null;
}

interface ProjectGroup {
  id: string;
  group_name: string;
  project_group_members: { project_id: string }[];
}

function getTrend(
  current: number,
  prior: number
): { percentChange: number | null; trend: string } {
  if (prior === 0 && current === 0)
    return { percentChange: null, trend: "inactive" };
  if (prior === 0) return { percentChange: null, trend: "new" };
  if (current === 0) return { percentChange: -100, trend: "disengaged" };
  const pct = ((current - prior) / prior) * 100;
  let trend: string;
  if (pct > 30) trend = "rocket ship";
  else if (pct > 10) trend = "ramping";
  else if (pct >= -10) trend = "steady";
  else if (pct >= -30) trend = "slowing";
  else trend = "declining";
  return { percentChange: Math.round(pct * 10) / 10, trend };
}

export function registerUtilizationTool(server: McpServer, supabase: SupabaseClient) {
  server.tool(
    "get_relative_utilization",
    "Compare portfolio engagement between two periods to identify trends. Labels each client/group as rocket ship, ramping, steady, slowing, or declining.",
    {
      period_days: z
        .number()
        .default(60)
        .describe("Length of each comparison period in days"),
      reference_date: z
        .string()
        .default(todayStr())
        .describe("End date for the current period"),
      use_groups: z
        .boolean()
        .default(true)
        .describe("If true, aggregate projects under project group names"),
    },
    async ({ period_days, reference_date, use_groups }) => {
      try {
        let groupMap = new Map<string, string>();
        if (use_groups) {
          const { data: groups } = await supabase
            .from("project_groups")
            .select("id, group_name, project_group_members(project_id)");

          for (const g of (groups ?? []) as ProjectGroup[]) {
            for (const m of g.project_group_members) {
              groupMap.set(m.project_id, g.group_name);
            }
          }
        }

        const fullStart = daysAgo(period_days * 2, reference_date);

        const entries = await paginatedFetch<TimeEntry>((from, to) =>
          supabase
            .from("time_entries")
            .select(
              `hours, spent_date,
               project:projects(id, name, client:clients(name)),
               team_member:team_members(first_name, last_name)`
            )
            .gte("spent_date", fullStart)
            .lte("spent_date", reference_date)
            .range(from, to)
        );

        const currentStart = daysAgo(period_days, reference_date);

        interface Bucket {
          isGroup: boolean;
          currentDays: number;
          priorDays: number;
          memberCurrent: Map<string, number>;
          memberPrior: Map<string, number>;
        }
        const buckets = new Map<string, Bucket>();

        for (const e of entries) {
          if (!e.project?.client?.name) continue;
          if (isDueDiligenceProject(e.project.name)) continue;
          if (isExcludedClient(e.project.client.name)) continue;

          const groupName = groupMap.get(e.project.id);
          const entityName = groupName ?? e.project.client.name;
          const isGroup = !!groupName;

          if (!buckets.has(entityName)) {
            buckets.set(entityName, {
              isGroup,
              currentDays: 0,
              priorDays: 0,
              memberCurrent: new Map(),
              memberPrior: new Map(),
            });
          }
          const bucket = buckets.get(entityName)!;

          const isCurrent = e.spent_date >= currentStart;
          const memberName = e.team_member
            ? `${e.team_member.first_name} ${e.team_member.last_name}`
            : "Unknown";

          if (isCurrent) {
            bucket.currentDays += e.hours;
            bucket.memberCurrent.set(
              memberName,
              (bucket.memberCurrent.get(memberName) ?? 0) + e.hours
            );
          } else {
            bucket.priorDays += e.hours;
            bucket.memberPrior.set(
              memberName,
              (bucket.memberPrior.get(memberName) ?? 0) + e.hours
            );
          }
        }

        const result = Array.from(buckets.entries())
          .map(([name, b]) => {
            const { percentChange, trend } = getTrend(
              b.currentDays,
              b.priorDays
            );
            const allMembers = new Set([
              ...b.memberCurrent.keys(),
              ...b.memberPrior.keys(),
            ]);
            return {
              name,
              isGroup: b.isGroup,
              currentDays: Math.round(b.currentDays * 100) / 100,
              priorDays: Math.round(b.priorDays * 100) / 100,
              difference:
                Math.round((b.currentDays - b.priorDays) * 100) / 100,
              percentChange,
              trend,
              teamMembers: Array.from(allMembers).map((m) => ({
                name: m,
                currentDays:
                  Math.round((b.memberCurrent.get(m) ?? 0) * 100) / 100,
                priorDays:
                  Math.round((b.memberPrior.get(m) ?? 0) * 100) / 100,
              })),
            };
          })
          .sort((a, b) => b.currentDays - a.currentDays);

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
