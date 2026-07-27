# Cloud Cost Showback — prototype

A multi-cloud FinOps cost showback dashboard prototype. It demonstrates the
config-driven dashboard architecture (adapter → variables → drill-down →
widgets) against a local CSV shaped like our raw cost export, before we build
the real pipeline (AWS Cost Explorer, Azure Cost Management, Datadog usage,
MongoDB Atlas billing → FOCUS normalization).

## Run it

```bash
npm install
npm run generate:data   # refresh public/data/costs.csv (past 14 days from "now")
npm run dev
```

A generated CSV is committed so the app works out of the box, but its date
window is fixed at generation time — re-run `npm run generate:data` if the
dashboard looks empty because the data has gone stale.

To use your company logo, replace `public/logo.svg` with your own file (any
square-ish image works; it renders at 36×36 in the header next to the title).

## Architecture

```
src/
  adapters/
    DataSourceAdapter.ts   ← THE data contract (query in, {rows, columns} out)
    CsvAdapter.ts          ← prototype impl: papaparse + in-memory aggregation
  config/
    schema.ts              ← dashboard config contract (variables, grid, widgets)
    sampleDashboard.ts     ← the hardcoded sample dashboard
  engine/
    variables.ts           ← {{variable}} resolution + per-widget dependency sets
    dateRanges.ts          ← date range presets (UTC)
  state/DashboardContext.tsx ← variables, breadcrumb trail, technical toggle
  hooks/useWidgetData.ts   ← resolve + fetch, selective refetch per widget
  components/              ← shell, VariableBar, Breadcrumb, grid, widget renderer
```

Key properties:

- **Swappable data source.** Widgets, layout, and variable logic only know
  `DataSourceAdapter.fetch(query, variables)` and the normalized `DataResult`.
  Replacing the CSV with live APIs means writing an `ApiAdapter`, changing one
  line in `App.tsx`.
- **Config-driven dashboards.** `sampleDashboard.ts` is plain JSON-shaped
  data: variables, a 12-column grid, and widgets with queries that may
  reference `{{variables}}`. New widgets/dashboards are config, not code.
- **Selective refetch.** Each widget's variable dependencies are computed once
  at config load; changing a variable only refetches widgets that use it.
- **Progressive disclosure.** Landing view is one number + one trend line.
  Clicking chart segments drills down via a breadcrumb trail
  (`Total spend › payments › checkout-api`), and a separate technical-detail
  toggle reveals `audience: "technical"` widgets (service_name / provider
  breakdowns) at any depth.

## Data

`public/data/costs.csv` mirrors the raw cost export (hourly granularity —
widgets sum hours into calendar days where needed):

```
Provider, service_name, application_service, Cost, Environment, Team, Date, Account_ID
```

`public/data/business_metrics.csv` holds business unit metrics per
microservice, hourly, timeline-aligned with the cost data (`Time_Stamp` or
`Timestamp` accepted for the first column):

```
Time_Stamp, Environment, Service_Name, identified_transaction, Successful_Transactions
```

`Service_Name` must match `application_service` values in the cost export
(and `Environment` values must match too) — that's the join key for unit
economics. Timestamps may be ISO 8601 (`2026-07-26T14:00:00Z`), zone-less
ISO (`2026-07-26 14:00:00`), or day-first `DD/MM/YY HH:MM` (`27/07/26 23:00`
— always read day-first, never US month-first); all are treated as UTC. Three metrics are supported in widget queries: `sum(Cost)`,
`sum(Successful_Transactions)`, and `costPerTransaction`
(spend ÷ successful transactions, joined per service/environment/day).
To use your own files, replace them under `public/data/` and reload the page.

Notes / prototype limitations:

- All calendar math is UTC, matching the generated timestamps.
- Only `sum(Cost)` and equality filters are implemented — extend the query
  schema when a real source needs more.
- Budgets are static demo targets in the sample config; real budget objects
  come with the pipeline.
- The export only spans 14 days, so month-over-month comparison isn't
  possible yet; the big-number trend chip compares the trailing 7 days
  against the 7 days before instead.
