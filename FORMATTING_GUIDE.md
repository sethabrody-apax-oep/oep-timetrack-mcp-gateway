# OEP TimeTrack — Analysis Formatting Guide for Claude Desktop

When using the `oep-timetrack` MCP tools in Claude Desktop, follow these conventions to produce output that is consistent with the OEP TimeTrack dashboard application.

---

## Terminology

| Term | Meaning |
|------|---------|
| Days | The primary unit of measure. Database stores hours but they represent **days** (not clock hours). Display as "days" always. |
| DD / Due Diligence | Investment research phase. Parsed from time entry notes starting with "Project ". |
| Sector | Industry classification: Services, Tech, Healthcare, Internet & Consumer, Impact, ADF, Legacy Media |
| Geography | Portfolio company location: US, UK, Europe, DACH, France, Nordics, Benelux, ROW |
| Practice Area | Team functional area: Digital Growth, SAB, Data, Tech, Enterprise Performance, Sustainability, OEP |
| Deal Partner Hub | Geographic hub for deal sourcing (Nicolas, Salim, Nathalie, Roelof, Edgar, Leon, Andrei, James) |
| Allocation Rule | "Deals & Diligence" vs "Other Activities" |
| Portcos | Portfolio companies |
| NTM | Next Twelve Months (forecast horizon) |
| Committed Days | Contracted day allocation for a contractor |

---

## Number Formatting

- **Days**: 2 decimal places by default. `12.46 days`, not `12.456` or `12`.
- **Percentages**: 1 decimal place. `45.6%`, not `45.63%` or `46%`.
- **Currency**: Symbol prefix, 2 decimals, thousands separator. `$1,234.56`, `€2,450.00`, `£875.50`.
- **Rounding**: Always `Math.round(value * 100) / 100` before display.
- **Zero values**: Show `0.00`, not blank or `-`.

---

## Table Formatting

When presenting data in tables:

```
| Client              | Days   | Team Members |
|---------------------|--------|--------------|
| Acme Corp           | 45.50  | 4            |
| Beta Holdings       | 32.25  | 3            |
| Gamma Partners      | 18.75  | 2            |
```

- **Sort**: By days descending unless otherwise specified.
- **Alignment**: Names left, numbers right.
- **Top N**: Default to top 15 for portfolio, top 10 for deals, all for team roster.

---

## Trend Labels

When comparing two periods (used by `get_relative_utilization`):

| Trend | Condition | Emoji |
|-------|-----------|-------|
| Rocket Ship | >+30% change | 🚀 |
| Ramping | +10% to +30% | 📈 |
| Steady | -10% to +10% | ➡️ |
| Slowing | -10% to -30% | 📉 |
| Declining | <-30% | ⬇️ |
| New | Prior period = 0 | 🆕 |
| Disengaged | Current period = 0 | ⛔ |
| Inactive | Both periods = 0 | — |

Show the trend label alongside the percentage change: `Acme Corp: +24.5% 📈 Ramping`

---

## Color Associations

When describing or categorizing data, use these associations consistently:

**Sectors:**
- Services → Blue
- DD → Purple
- ADF → Orange/Gray
- Internet & Consumer → Pink
- Tech → Yellow/Amber
- Impact → Emerald/Teal
- Healthcare → Dark Blue
- OEP → Light Purple

**Geographies:**
- US → Blue
- UK → Red
- Europe → Green
- DACH → Amber
- France → Violet
- Nordics → Cyan

**Comparisons:**
- Current period → Blue
- Prior period → Amber/Yellow
- Positive change → Green
- Negative change → Red
- Neutral → Gray

---

## Analysis Structure

### Portfolio Summary
When asked about portfolio activity, structure as:

1. **Top-line summary** — Total days across all portfolio companies, number of active engagements, date range
2. **Top engagements table** — Ranked by days, with team member count
3. **Team breakdown per client** — Names and individual days, sorted descending
4. **Excluded**: Always exclude internal clients (xExpenses, z - Time Management, Client)

### Deal Pipeline
When asked about deals/DD:

1. **Active deal count** and total days
2. **Deal table** — Deal name, client, total days, team members
3. **Team involvement** — Who is working on what, sorted by days

### Utilization Comparison
When asked about trends:

1. **Period definition** — "Comparing [date1–date2] vs [date3–date4]"
2. **Trend summary** — Count of rocket ship, ramping, steady, slowing, declining
3. **Detail table** — Entity, current days, prior days, change, trend label
4. **Highlight** — Call out the biggest movers (top 3 increases, top 3 decreases)

### Sector/Geography Breakdown
When asked about allocation by dimension:

1. **Summary** — Total days, number of categories, date range
2. **Category table** — Category name, total days, percentage of total
3. **Within each category** — Top clients and their days
4. **"Uncategorized"** — Always show if present, note it means project metadata is incomplete

### Team Roster
When showing the team:

1. **Active count** — "N active team members"
2. **Table** — Name, email, practice area
3. **Group by practice area** if helpful

---

## Query Patterns

When using `run_sql_query` for custom analysis, follow these conventions:

```sql
-- Always filter to date range
WHERE te.spent_date >= '2025-01-01' AND te.spent_date <= '2025-03-31'

-- Exclude internal clients
AND c.name NOT ILIKE 'xExpenses%'
AND c.name != 'z - Time Management'
AND c.name != 'Client'

-- Join pattern for enriched queries
FROM time_entries te
JOIN projects p ON te.project_id = p.id
LEFT JOIN clients c ON p.client_id = c.id
LEFT JOIN team_members tm ON te.team_member_id = tm.id

-- For sector/geography enrichment
LEFT JOIN project_metadata pm ON p.id = pm.project_id
LEFT JOIN sectors s ON pm.sector_id = s.id
LEFT JOIN portfolio_geos g ON pm.portfolio_geo_id = g.id

-- For practice area
LEFT JOIN team_member_metadata tmm ON tm.id = tmm.team_member_id
LEFT JOIN practice_areas pa ON tmm.practice_area_id = pa.id

-- Standard aggregation
GROUP BY c.name
ORDER BY SUM(te.hours) DESC
LIMIT 15
```

- `te.hours` is in **day units**, not clock hours.
- Use `SUM(te.hours)` for total days; round with `ROUND(SUM(te.hours), 2)`.
- DD projects: `p.name ILIKE '%deals%' OR p.name ILIKE '%diligence%'`.
- DD entries: `te.notes ILIKE 'Project %'`.
- Deal name extraction: text between "Project " and " - " in `te.notes`.

---

## Response Style

- **Lead with insight**, not raw data. "Portfolio activity is concentrated in 5 clients accounting for 68% of total days."
- **Use tables** for any list with 3+ items.
- **Bold key numbers** in prose: "The team logged **245.50 days** across **18 portfolio companies**."
- **Round prose numbers** to nearest whole: "roughly 250 days" — but show exact in tables.
- **Note data gaps**: If sectors/geos are "Uncategorized", mention it.
- **Date context**: Always state the date range analyzed.
- **Comparisons**: When comparing periods, state both clearly: "Current (Jan 1 – Mar 31) vs Prior (Oct 1 – Dec 31)".
