# OEP TimeTrack MCP Gateway

Connect [Claude Desktop](https://claude.ai/download) to OEP TimeTrack data using your existing app credentials.

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/sethabrody-apax-oep/oep-timetrack-mcp-gateway/main/install.sh | bash
```

**Requirements:** [Node.js](https://nodejs.org) and [Claude Desktop](https://claude.ai/download)

## Manual Install

1. Open your Claude Desktop config:
   - **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add this inside `"mcpServers"`:

```json
"oep-timetrack": {
  "command": "npx",
  "args": ["mcp-remote", "https://mcp-gateway-five.vercel.app/mcp"]
}
```

3. Restart Claude Desktop
4. A browser window opens — sign in with your **time.apaxapps.com** email, password, and MFA code
5. The first connection may time out while you authenticate — restart Claude Desktop once more and it connects instantly (your token is cached)

## Available Tools

| Tool | Description |
|------|-------------|
| `get_team_roster` | Team members with practice area assignments |
| `get_deals_and_diligence` | Active deals parsed from time entry notes |
| `get_portfolio_engagements` | Top portfolio companies by time spent |
| `get_relative_utilization` | Period-over-period engagement trends |
| `get_days_by_sector` | Time breakdown by sector, geography, subsector, or deal partner |
| `get_time_summary` | Aggregated time by client, project, or team member |
| `run_sql_query` | Read-only SQL for custom analytics |

## Example Prompts

- "Show me the active team roster"
- "What are the top portfolio engagements from the last 90 days?"
- "Show me deal activity from the last 30 days"
- "Compare portfolio utilization between the last two quarters"
- "Break down time by sector for the last 6 months"
