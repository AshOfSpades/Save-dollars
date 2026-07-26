import type { DataResult } from "../../types/data";
import type { WidgetOptions } from "../../config/schema";
import { formatValue } from "../../utils/format";
import { EmptyState } from "../WidgetFrame";

/** Generic tabular view of a query result (adapter sorts by value desc). */
export function TableWidget({ data, options }: { data: DataResult; options?: WidgetOptions }) {
  if (data.rows.length === 0) return <EmptyState />;

  const format = options?.format ?? "currency";
  const valueLabel = options?.valueLabel ?? "Cost";

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            {data.columns.map((col) => (
              <th
                key={col.name}
                className={`py-2 pr-3 font-medium ${col.type === "number" ? "text-right" : ""}`}
              >
                {col.name === "value" ? valueLabel : col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              {data.columns.map((col) => (
                <td
                  key={col.name}
                  className={`py-1.5 pr-3 ${
                    col.type === "number"
                      ? "text-right font-medium tabular-nums text-ink"
                      : "text-slate-600"
                  }`}
                >
                  {col.type === "number"
                    ? formatValue(Number(row[col.name]), format)
                    : String(row[col.name])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
