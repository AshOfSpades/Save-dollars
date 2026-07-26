import type { DataResult } from "../../types/data";
import type { WidgetOptions } from "../../config/schema";
import type { TrendInfo } from "../../hooks/useWidgetData";
import { formatCurrency, formatPercentDelta, formatValue } from "../../utils/format";

/**
 * One big figure, with an optional trend chip (value up = danger, value
 * down = success — cost semantics) and an optional budget progress bar.
 * If the result carries an identified_transaction column (unit economics),
 * the first row's transaction name is shown as a caption.
 */
export function BigNumberWidget({
  data,
  trend,
  options,
}: {
  data: DataResult;
  trend: TrendInfo | null;
  options?: WidgetOptions;
}) {
  const value = Number(data.rows[0]?.value ?? 0);
  const format = options?.format ?? "currency";
  const budget = options?.budget;
  const budgetUsed = budget ? value / budget : null;
  const overBudget = budgetUsed !== null && budgetUsed > 1;

  const transactionName = data.rows[0]?.identified_transaction;

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-4xl font-semibold tracking-tight text-ink">
          {format === "currency" ? formatCurrency(value) : formatValue(value, format)}
        </span>
        {trend && trend.fraction !== null && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              trend.fraction > 0 ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
            }`}
            title={trend.label}
          >
            <span aria-hidden>{trend.fraction > 0 ? "\u25b2" : "\u25bc"}</span>
            {formatPercentDelta(trend.fraction)}
            <span className="font-normal opacity-70">{trend.label}</span>
          </span>
        )}
      </div>

      {typeof transactionName === "string" && (
        <p className="-mt-1 text-xs text-slate-500">
          {format === "unitCurrency" ? `per "${transactionName}"` : `"${transactionName}"`}
        </p>
      )}

      {budget != null && budgetUsed !== null && (
        <div className="space-y-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${overBudget ? "bg-danger" : "bg-success"}`}
              style={{ width: `${Math.min(budgetUsed * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            <span className={`font-medium ${overBudget ? "text-danger" : "text-success"}`}>
              {Math.round(budgetUsed * 100)}%
            </span>{" "}
            of {formatCurrency(budget)} {options?.budgetLabel ?? "budget"}
            {overBudget && <span className="font-medium text-danger"> · over budget</span>}
          </p>
        </div>
      )}
    </div>
  );
}
