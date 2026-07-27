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
        <thead className="sticky top-0 bg-gray-800">
          <tr className="border-b border-gray-700 text-left text-xs uppercase tracking-wide text-slate-400">
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
            <tr key={i} className="border-b border-gray-700/60 last:border-0 hover:bg-gray-700/50">
              {data.columns.map((col) => (
                <td
                  key={col.name}
                  className={`py-1.5 pr-3 ${
                    col.type === "number"
                      ? "text-right font-medium tabular-nums text-ink"
                      : "text-slate-300"
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
