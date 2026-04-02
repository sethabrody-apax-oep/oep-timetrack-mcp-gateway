import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerTeamTool } from "./tools/team.js";
import { registerDealsTool } from "./tools/deals.js";
import { registerPortfolioTool } from "./tools/portfolio.js";
import { registerUtilizationTool } from "./tools/utilization.js";
import { registerSectorsTool } from "./tools/sectors.js";
import { registerSummaryTool } from "./tools/summary.js";
import { registerSqlTool } from "./tools/sql.js";

export function registerAllTools(server: McpServer, supabase: SupabaseClient): void {
  registerTeamTool(server, supabase);
  registerDealsTool(server, supabase);
  registerPortfolioTool(server, supabase);
  registerUtilizationTool(server, supabase);
  registerSectorsTool(server, supabase);
  registerSummaryTool(server, supabase);
  registerSqlTool(server, supabase);
}
