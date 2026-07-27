/**
 * CsvAdapter — prototype DataSourceAdapter backed by local CSV files.
 *
 * Two datasets, loaded once each (papaparse, cached promises):
 *
 * - costs CSV: raw hourly multi-cloud cost export
 * - business metrics CSV (optional): hourly successful-transaction counts
 *   per microservice (Time_Stamp / Environment / Service_Name /
 *   identified_transaction / Successful_Transactions). Rows are normalized
 *   onto the shared dimension names (Service_Name -> application_service)
 *   and enriched with the owning Team from the cost data, so breadcrumb
 *   drill-down filters apply to both datasets.
 *
 * Queries are answered by filtering / grouping / summing in memory. The
 * `costPerTransaction` metric joins the two datasets per group on their
 * shared dimensions (+ calendar day at daily granularity). The real
 * ApiAdapter will translate the same `ResolvedQuery` into upstream API calls
 * instead; nothing above this file should change.
 */

import Papa from "papaparse";
import type {
  DataSourceAdapter,
  VariableValues,
  WidgetQuery,
} from "./DataSourceAdapter";
import {
  COST_DIMENSION_FIELDS,
  TRANSACTION_DIMENSION_FIELDS,
  type ColumnMeta,
  type CostRow,
  type DataResult,
  type DimensionField,
  type TransactionRow,
} from "../types/data";
import { resolveQuery, type ResolvedQuery } from "../engine/variables";

const DAY_MS = 86_400_000;
const KEY_SEP = "\u0000";

const COST_FIELDS = new Set<string>(COST_DIMENSION_FIELDS);
const TX_FIELDS = new Set<string>(TRANSACTION_DIMENSION_FIELDS);
/** Dimensions present in both datasets — the join keys for unit economics. */
const SHARED_FIELDS = new Set<string>(["application_service", "Environment", "Team"]);

type RawCsvRow = Record<string, string>;

async function fetchCsv(url: string): Promise<RawCsvRow[]> {
  // Revalidate with the server instead of trusting the browser cache, so a
  // replaced CSV shows up on the next page reload.
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
  const text = await res.text();
  const parsed = Papa.parse<RawCsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    // Real-world exports come with BOMs and padded headers/cells; normalize
    // them so column lookups don't silently return undefined.
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
    transform: (v) => v.trim(),
  });
  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse error in ${url}: ${parsed.errors[0].message}`);
  }
  return parsed.data;
}

/**
 * Parse a timestamp cell. Accepted formats, all treated as UTC so day
 * bucketing doesn't depend on the viewer's browser timezone:
 *
 * - ISO 8601 ("2026-07-26T14:00:00Z"), with or without a zone suffix
 * - zone-less ISO-ish ("2026-07-26 14:00:00")
 * - the raw export's day-first form "DD/MM/YY HH:MM" ("27/07/26 23:00"),
 *   also with 4-digit years and optional seconds. NOTE: slash dates are
 *   always read day-first (27/07 = 27 July), never US month-first.
 *
 * Returns NaN for unparseable input.
 */
function parseTimestamp(raw: string | undefined): number {
  if (!raw) return NaN;
  const dayFirst =
    /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(raw);
  if (dayFirst) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = dayFirst;
    const day = Number(d);
    const month = Number(m);
    if (month < 1 || month > 12 || day < 1 || day > 31) return NaN;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const ts = Date.UTC(year, month - 1, day, Number(hh), Number(mm), Number(ss));
    // Reject dates that rolled over (e.g. 31/02) instead of silently shifting.
    return new Date(ts).getUTCDate() === day ? ts : NaN;
  }
  const isoNoZone = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(raw);
  if (isoNoZone) return Date.parse(`${isoNoZone[1]}T${isoNoZone[2]}Z`);
  return Date.parse(raw);
}

/** Parse a numeric cell, tolerating "$1,234.56"-style formatting. */
function parseAmount(raw: string | undefined): number {
  if (raw === undefined || raw === "") return NaN;
  return Number(raw.replace(/[$,]/g, ""));
}

/**
 * Drop rows whose timestamp/value failed to parse (warning to the console),
 * and fail loudly with an actionable message — instead of letting daily
 * widgets crash later with "RangeError: Invalid time value" — when nothing
 * in the file parses (wrong date format or column headers).
 */
function requireParsedRows<R extends { ts: number }>(
  rows: R[],
  getValue: (row: R) => number,
  url: string,
  rawRows: RawCsvRow[],
  timeColumn: string,
  valueColumn: string
): R[] {
  const valid = rows.filter((r) => Number.isFinite(r.ts) && Number.isFinite(getValue(r)));
  if (valid.length === 0 && rows.length > 0) {
    const sample = rawRows[0] ?? {};
    throw new Error(
      `No parseable rows in ${url}. Check the "${timeColumn}" and "${valueColumn}" columns ` +
        `(first row has ${timeColumn}="${sample[timeColumn] ?? "<missing>"}", ` +
        `${valueColumn}="${sample[valueColumn] ?? "<missing>"}"). ` +
        `Supported timestamps: ISO 8601 (2026-07-26T14:00:00Z) or day-first DD/MM/YY HH:MM (27/07/26 23:00).`
    );
  }
  if (valid.length < rows.length) {
    console.warn(
      `[CsvAdapter] Dropped ${rows.length - valid.length} of ${rows.length} rows in ${url} ` +
        `with unparseable "${timeColumn}" or "${valueColumn}" values.`
    );
  }
  logDatasetSummary(url, valid);
  return valid;
}

/**
 * One-line load summary per dataset (row count + time span) — the first
 * thing to check when widgets come up empty: does the span overlap the
 * selected date range at all?
 */
function logDatasetSummary(url: string, rows: { ts: number }[]): void {
  if (rows.length === 0) {
    console.info(`[CsvAdapter] Loaded 0 rows from ${url}`);
    return;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    if (r.ts < min) min = r.ts;
    if (r.ts > max) max = r.ts;
  }
  console.info(
    `[CsvAdapter] Loaded ${rows.length} rows from ${url}, spanning ` +
      `${new Date(min).toISOString()} .. ${new Date(max).toISOString()} (UTC)`
  );
}

export class CsvAdapter implements DataSourceAdapter {
  private readonly costsUrl: string;
  private readonly businessMetricsUrl: string | undefined;
  private costsPromise: Promise<CostRow[]> | null = null;
  private transactionsPromise: Promise<TransactionRow[]> | null = null;

  constructor(costsUrl: string, businessMetricsUrl?: string) {
    this.costsUrl = costsUrl;
    this.businessMetricsUrl = businessMetricsUrl;
  }

  private loadCosts(): Promise<CostRow[]> {
    this.costsPromise ??= fetchCsv(this.costsUrl).then((raw) => {
      const rows = raw.map((r) => ({
        Provider: r.Provider,
        service_name: r.service_name,
        application_service: r.application_service,
        Environment: r.Environment,
        Team: r.Team,
        Account_ID: r.Account_ID,
        cost: parseAmount(r.Cost),
        ts: parseTimestamp(r.Date),
      }));
      return requireParsedRows(rows, (r) => r.cost, this.costsUrl, raw, "Date", "Cost");
    });
    return this.costsPromise;
  }

  private loadTransactions(): Promise<TransactionRow[]> {
    this.transactionsPromise ??= (async () => {
      const url = this.businessMetricsUrl;
      if (!url) {
        throw new Error("No business metrics CSV configured for this adapter");
      }
      const [raw, costRows] = await Promise.all([fetchCsv(url), this.loadCosts()]);
      // Team ownership lives only in the cost export; carry it over so Team
      // drill-downs and groupings work on transaction metrics too.
      const teamByService = new Map(costRows.map((r) => [r.application_service, r.Team]));
      const rows = raw.map((r) => ({
        application_service: r.Service_Name,
        Environment: r.Environment,
        Team: teamByService.get(r.Service_Name) ?? "",
        identified_transaction: r.identified_transaction,
        transactions: parseAmount(r.Successful_Transactions),
        // Header seen both as Time_Stamp and Timestamp in the wild.
        ts: parseTimestamp(r.Time_Stamp ?? r.Timestamp),
      }));
      return requireParsedRows(
        rows,
        (r) => r.transactions,
        url,
        raw,
        "Time_Stamp",
        "Successful_Transactions"
      );
    })();
    return this.transactionsPromise;
  }

  async fetch(query: WidgetQuery, variables: VariableValues): Promise<DataResult> {
    const q = resolveQuery(query, variables);
    switch (q.metric) {
      case "sum(Cost)": {
        assertFields(q, COST_FIELDS, "sum(Cost)");
        const rows = await this.loadCosts();
        return buildResult(q, groupSums(rows, q, (r) => r.cost), q.groupBy);
      }
      case "sum(Successful_Transactions)": {
        assertFields(q, TX_FIELDS, "sum(Successful_Transactions)");
        const rows = await this.loadTransactions();
        return buildResult(q, groupSums(rows, q, (r) => r.transactions), q.groupBy);
      }
      case "costPerTransaction":
        return this.costPerTransaction(q);
      default:
        throw new Error(`Unsupported metric "${q.metric}"`);
    }
  }

  /**
   * sum(Cost) / sum(Successful_Transactions) per group. Groups may include
   * identified_transaction (transaction side only — the service's full cost
   * is attributed to each of its identified transactions); everything else
   * must be a shared dimension so both sides of the ratio see the same
   * slice.
   */
  private async costPerTransaction(q: ResolvedQuery): Promise<DataResult> {
    for (const f of q.filters) {
      if (!SHARED_FIELDS.has(f.field) && f.field !== "identified_transaction") {
        throw new Error(
          `costPerTransaction filters must use shared dimensions (application_service, Environment, Team) or identified_transaction; got "${f.field}"`
        );
      }
    }
    for (const g of q.groupBy) {
      if (!SHARED_FIELDS.has(g) && g !== "identified_transaction") {
        throw new Error(`costPerTransaction cannot group by "${g}"`);
      }
    }

    const [costRows, txRows] = await Promise.all([this.loadCosts(), this.loadTransactions()]);

    const txSums = groupSums(txRows, q, (r) => r.transactions);
    const costQ: ResolvedQuery = {
      ...q,
      groupBy: q.groupBy.filter((g) => g !== "identified_transaction"),
      filters: q.filters.filter((f) => f.field !== "identified_transaction"),
    };
    const costSums = groupSums(costRows, costQ, (r) => r.cost);

    // Join: a transaction group's cost key is its key minus the
    // identified_transaction part.
    const txOnlyIdx = q.groupBy
      .map((g, i) => (g === "identified_transaction" ? i + (q.granularity === "day" ? 1 : 0) : -1))
      .filter((i) => i >= 0);
    const ratios = new Map<string, number>();
    for (const [key, tx] of txSums) {
      if (tx <= 0) continue;
      const parts = key.split(KEY_SEP);
      const costKey = parts.filter((_, i) => !txOnlyIdx.includes(i)).join(KEY_SEP);
      const cost = costSums.get(costKey);
      if (cost === undefined) continue;
      ratios.set(key, cost / tx);
    }

    // Empty unit economics is almost always a data alignment problem between
    // the two CSVs — say which side failed so it's diagnosable from the
    // console instead of a blank widget.
    if (ratios.size === 0) {
      const reason =
        txSums.size === 0
          ? "no transaction rows match the current filters/date range (check that Service_Name values " +
            "match application_service in the cost CSV — Team drill-down filters depend on that — " +
            "that Environment values match, and that timestamps fall inside the selected date range)"
          : costSums.size === 0
            ? "no cost rows match the current filters/date range"
            : "cost and transaction rows never share a group — check that Service_Name / Environment " +
              "values are spelled identically (case-sensitive) in both CSVs";
      console.warn(`[CsvAdapter] costPerTransaction returned no rows: ${reason}.`);
    }
    return buildResult(q, ratios, q.groupBy, /* precision */ 6);
  }

  async distinctValues(field: DimensionField): Promise<string[]> {
    const rows =
      field === "identified_transaction" ? await this.loadTransactions() : await this.loadCosts();
    const values = new Set<string>();
    for (const row of rows) {
      const v = (row as Record<string, string | number>)[field];
      if (typeof v === "string" && v !== "") values.add(v);
    }
    return [...values].sort();
  }
}

function assertFields(q: ResolvedQuery, allowed: Set<string>, metric: string): void {
  for (const f of [...q.groupBy, ...q.filters.map((x) => x.field)]) {
    if (!allowed.has(f)) {
      throw new Error(`Dimension "${f}" is not available for metric ${metric}`);
    }
  }
}

/** UTC calendar day of a timestamp, as "YYYY-MM-DD". */
function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

type AnyRow = { ts: number } & Record<string, string | number>;

/**
 * Filter rows by the query's range + filters, then sum `getValue` per group
 * key ([day,] ...groupBy values). Daily results are zero-filled across the
 * requested range (clamped to the extent of the dataset, so a range that
 * reaches beyond the data doesn't draw misleading $0 days).
 */
function groupSums<R extends AnyRow>(
  rows: R[],
  q: ResolvedQuery,
  getValue: (row: R) => number
): Map<string, number> {
  const daily = q.granularity === "day";
  const sums = new Map<string, number>();
  let minTs = Infinity;
  let maxTs = -Infinity;

  for (const row of rows) {
    if (row.ts < minTs) minTs = row.ts;
    if (row.ts > maxTs) maxTs = row.ts;
    if (q.range && (row.ts < q.range.start || row.ts >= q.range.end)) continue;
    if (!q.filters.every((f) => row[f.field] === f.value)) continue;
    const parts = q.groupBy.map((field) => String(row[field]));
    if (daily) parts.unshift(dayKey(row.ts));
    const key = parts.join(KEY_SEP);
    sums.set(key, (sums.get(key) ?? 0) + getValue(row));
  }

  if (daily && q.range && sums.size > 0) {
    const start = Math.max(q.range.start, minTs);
    const end = Math.min(q.range.end, maxTs + 1);
    const groupSuffixes = new Set(
      [...sums.keys()].map((k) => k.split(KEY_SEP).slice(1).join(KEY_SEP))
    );
    for (let ts = start; ts < end; ts += DAY_MS) {
      for (const suffix of groupSuffixes) {
        const key = suffix === "" ? dayKey(ts) : dayKey(ts) + KEY_SEP + suffix;
        if (!sums.has(key)) sums.set(key, 0);
      }
    }
  }

  return sums;
}

/** Turn grouped sums into the normalized DataResult table. */
function buildResult(
  q: ResolvedQuery,
  sums: Map<string, number>,
  groupBy: string[],
  precision = 2
): DataResult {
  const daily = q.granularity === "day";
  const factor = 10 ** precision;

  const columns: ColumnMeta[] = [
    ...(daily ? [{ name: "date", type: "date" } as ColumnMeta] : []),
    ...groupBy.map((name): ColumnMeta => ({ name, type: "string" })),
    { name: "value", type: "number" },
  ];

  const out = [...sums.entries()].map(([key, value]) => {
    const parts = key.split(KEY_SEP);
    const row: Record<string, string | number> = {};
    let i = 0;
    if (daily) row.date = parts[i++];
    for (const field of groupBy) row[field] = parts[i++];
    row.value = Math.round(value * factor) / factor;
    return row;
  });

  // Deterministic ordering: time series by date, breakdowns by value desc.
  out.sort(
    daily
      ? (a, b) => String(a.date).localeCompare(String(b.date))
      : (a, b) => Number(b.value) - Number(a.value)
  );

  return { columns, rows: out };
}
