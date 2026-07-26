/**
 * CsvAdapter — prototype DataSourceAdapter backed by a local CSV file.
 *
 * Loads the raw hourly cost export once (papaparse, cached promise), then
 * answers queries by filtering / grouping / summing in memory. The real
 * ApiAdapter will translate the same `ResolvedQuery` into upstream API calls
 * instead; nothing above this file should change.
 */

import Papa from "papaparse";
import type {
  DataSourceAdapter,
  VariableValues,
  WidgetQuery,
} from "./DataSourceAdapter";
import type { ColumnMeta, CostRow, DataResult, DimensionField } from "../types/data";
import { resolveQuery, type ResolvedQuery } from "../engine/variables";

const DAY_MS = 86_400_000;
const KEY_SEP = "\u0000";

type RawCsvRow = Record<string, string>;

export class CsvAdapter implements DataSourceAdapter {
  private loadPromise: Promise<CostRow[]> | null = null;
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  private load(): Promise<CostRow[]> {
    this.loadPromise ??= (async () => {
      const res = await fetch(this.url);
      if (!res.ok) throw new Error(`Failed to load ${this.url}: HTTP ${res.status}`);
      const text = await res.text();
      const parsed = Papa.parse<RawCsvRow>(text, { header: true, skipEmptyLines: true });
      if (parsed.errors.length > 0) {
        throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
      }
      return parsed.data.map((r) => ({
        Provider: r.Provider,
        service_name: r.service_name,
        application_service: r.application_service,
        Environment: r.Environment,
        Team: r.Team,
        Account_ID: r.Account_ID,
        cost: Number(r.Cost),
        ts: Date.parse(r.Date),
      }));
    })();
    return this.loadPromise;
  }

  async fetch(query: WidgetQuery, variables: VariableValues): Promise<DataResult> {
    const resolved = resolveQuery(query, variables);
    if (resolved.metric !== "sum(Cost)") {
      throw new Error(`CsvAdapter only supports sum(Cost), got "${resolved.metric}"`);
    }
    const rows = await this.load();
    return aggregate(rows, resolved);
  }

  async distinctValues(field: DimensionField): Promise<string[]> {
    const rows = await this.load();
    return [...new Set(rows.map((r) => r[field]))].sort();
  }
}

function matches(row: CostRow, q: ResolvedQuery): boolean {
  if (q.range && (row.ts < q.range.start || row.ts >= q.range.end)) return false;
  return q.filters.every((f) => row[f.field] === f.value);
}

/** UTC calendar day of a timestamp, as "YYYY-MM-DD". */
function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function aggregate(rows: CostRow[], q: ResolvedQuery): DataResult {
  const daily = q.granularity === "day";
  const sums = new Map<string, number>();
  let minTs = Infinity;
  let maxTs = -Infinity;

  for (const row of rows) {
    if (row.ts < minTs) minTs = row.ts;
    if (row.ts > maxTs) maxTs = row.ts;
    if (!matches(row, q)) continue;
    const parts = q.groupBy.map((field) => row[field]);
    if (daily) parts.unshift(dayKey(row.ts));
    const key = parts.join(KEY_SEP);
    sums.set(key, (sums.get(key) ?? 0) + row.cost);
  }

  // Daily series: zero-fill missing days so trend lines don't skip gaps.
  // The fill window is clamped to the extent of the loaded data, so a range
  // that reaches beyond the export (e.g. month-to-date on day 26 with a
  // 14-day export) doesn't draw misleading $0 days.
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

  const columns: ColumnMeta[] = [
    ...(daily ? [{ name: "date", type: "date" } as ColumnMeta] : []),
    ...q.groupBy.map((name): ColumnMeta => ({ name, type: "string" })),
    { name: "value", type: "number" },
  ];

  const out = [...sums.entries()].map(([key, value]) => {
    const parts = key.split(KEY_SEP);
    const row: Record<string, string | number> = {};
    let i = 0;
    if (daily) row.date = parts[i++];
    for (const field of q.groupBy) row[field] = parts[i++];
    row.value = Math.round(value * 100) / 100;
    return row;
  });

  // Deterministic ordering: time series by date, breakdowns by cost desc.
  out.sort(
    daily
      ? (a, b) => String(a.date).localeCompare(String(b.date))
      : (a, b) => Number(b.value) - Number(a.value)
  );

  return { columns, rows: out };
}
