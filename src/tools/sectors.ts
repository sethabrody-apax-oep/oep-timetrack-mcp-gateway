import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { paginatedFetch } from "../utils/pagination.js";
import {
  isExcludedClient,
  isDueDiligenceProject,
  daysAgo,
  todayStr,
} from "../utils/filters.js";

interface TimeEntry {
  hours: number;
  project: {
    id: string;
    name: string;
    client: { name: string } | null;
  } | null;
}

type GroupByDimension = "sector" | "geography" | "subsector" | "deal_partner";

const DIMENSION_CONFIG: Record<
  GroupByDimension,
  { metadataField: string; lookupTable: string }
> = {
  sector: { metadataField: "sector_id", lookupTable: "sectors" },
  geography: {
    metadataField: "portfolio_geo_id",
    lookupTable: "portfolio_geos",
  },
  subsector: { metadataField: "subsector_id", lookupTable: "subsectors" },
  deal_partner: {
    metadataField: "deal_partner_hub_id",
    lookupTable: "deal_partner_hubs",
  },
};

export function registerSectorsTool(server: McpServer, supabase: SupabaseClient) {
  server.tool(
    "get_days_by_sector",
    "Break down portfolio time by sector, geography, subsector, or deal partner. Shows total days per category with client-level detail.",
    {
      days_back: z.number().default(180).describe("Number of days to look back"),
      reference_date: z
        .string()
        .default(todayStr())
        .describe("Reference date in YYYY-MM-DD format"),
      group_by: z
        .enum(["sector", "geography", "subsector", "deal_partner"])
        .default("sector")
        .describe("Dimension to group by"),
    },
    async ({ days_back, reference_date, group_by }) => {
      try {
        const startDate = daysAgo(days_back, reference_date);
        const config = DIMENSION_CONFIG[group_by as GroupByDimension];

        const { data: lookupRows } = await supabase
          .from(config.lookupTable)
          .select("id, name");
        const lookupMap = new Map<string, string>();
        for (const r of lookupRows ?? []) {
          lookupMap.set(r.id, r.name);
        }

        const { data: metaRows } = await supabase
          .from("project_metadata")
          .select("*");
        const projectCategoryMap = new Map<string, string>();
        for (const m of (metaRows ?? []) as any[]) {
          const catId = m[config.metadataField];
          if (catId && lookupMap.has(catId)) {
            projectCategoryMap.set(m.project_id, lookupMap.get(catId)!);
          }
        }

        const entries = await paginatedFetch<TimeEntry>((from, to) =>
          supabase
            .from("time_entries")
            .select(
              `hours,
               project:projects(id, name, client:clients(name))`
            )
            .gte("spent_date", startDate)
            .lte("spent_date", reference_date)
            .range(from, to)
        );

        const categoryMap = new Map<
          string,
          { totalDays: number; clientMap: Map<string, number> }
        >();

        for (const e of entries) {
          if (!e.project?.client?.name) continue;
          if (isDueDiligenceProject(e.project.name)) continue;
          if (isExcludedClient(e.project.client.name)) continue;

          const category =
            projectCategoryMap.get(e.project.id) ?? "Uncategorized";
          if (!categoryMap.has(category)) {
            categoryMap.set(category, { totalDays: 0, clientMap: new Map() });
          }
          const cat = categoryMap.get(category)!;
          cat.totalDays += e.hours;
          cat.clientMap.set(
            e.project.client.name,
            (cat.clientMap.get(e.project.client.name) ?? 0) + e.hours
          );
        }

        const result = Array.from(categoryMap.entries())
          .map(([categoryName, data]) => ({
            categoryName,
            totalDays: Math.round(data.totalDays * 100) / 100,
            clients: Array.from(data.clientMap.entries())
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
