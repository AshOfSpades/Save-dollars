import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DataResult } from "../../types/data";
import type { WidgetOptions } from "../../config/schema";
import { chartChrome, themeColor } from "../../theme/colors";
import { formatDay, formatValue, formatValueCompact } from "../../utils/format";
import { EmptyState } from "../WidgetFrame";

/**
 * Single-series daily time series (line with a soft gradient fill).
 * Expects a daily-granularity result: `date` + `value` columns.
 */
export function LineChartWidget({
  widgetId,
  data,
  options,
}: {
  widgetId: string;
  data: DataResult;
  options?: WidgetOptions;
}) {
  if (data.rows.length === 0) return <EmptyState />;

  const color = themeColor(options?.color === "secondary" ? "secondary" : "primary");
  const format = options?.format ?? "currency";
  const valueLabel = options?.valueLabel ?? "Cost";
  const gradientId = `line-fill-${widgetId}`;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={chartChrome.gridLine} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => formatDay(d)}
          tick={{ fill: chartChrome.axisText, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(v: number) => formatValueCompact(v, format)}
          tick={{ fill: chartChrome.axisText, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip
          labelFormatter={(d) => formatDay(String(d))}
          formatter={(v) => [formatValue(Number(v), format), valueLabel]}
          contentStyle={{
            borderRadius: 8,
            borderColor: chartChrome.gridLine,
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
