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
  const parsed = Papa.parse<RawCsvRow>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse error in ${url}: ${parsed.errors[0].message}`);
  }
  return parsed.data;
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
    this.costsPromise ??= fetchCsv(this.costsUrl).then((raw) =>
      raw.map((r) => ({
        Provider: r.Provider,
        service_name: r.service_name,
        application_service: r.application_service,
        Environment: r.Environment,
        Team: r.Team,
        Account_ID: r.Account_ID,
        cost: Number(r.Cost),
        ts: Date.parse(r.Date),
      }))
    );
    return this.costsPromise;
  }

  private loadTransactions(): Promise<TransactionRow[]> {
    this.transactionsPromise ??= (async () => {
      if (!this.businessMetricsUrl) {
        throw new Error("No business metrics CSV configured for this adapter");
      }
      const [raw, costRows] = await Promise.all([
        fetchCsv(this.businessMetricsUrl),
        this.loadCosts(),
      ]);
      // Team ownership lives only in the cost export; carry it over so Team
      // drill-downs and groupings work on transaction metrics too.
      const teamByService = new Map(costRows.map((r) => [r.application_service, r.Team]));
      return raw.map((r) => ({
        application_service: r.Service_Name,
        Environment: r.Environment,
        Team: teamByService.get(r.Service_Name) ?? "",
        identified_transaction: r.identified_transaction,
        transactions: Number(r.Successful_Transactions),
        // Header seen both as Time_Stamp and Timestamp in the wild.
        ts: Date.parse(r.Time_Stamp ?? r.Timestamp),
      }));
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
