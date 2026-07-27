import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DataResult } from "../../types/data";
import type { WidgetOptions } from "../../config/schema";
import { chartChrome, themeColor } from "../../theme/colors";
import { formatValue, formatValueCompact } from "../../utils/format";
import { EmptyState } from "../WidgetFrame";

/**
 * Minimum horizontal space per category. With more categories than fit in
 * the widget, the chart grows beyond the card and scrolls horizontally
 * instead of cramming the bars together.
 */
const MIN_CATEGORY_SLOT_PX = 88;

/** Keep axis tick labels readable; the tooltip still shows the full name. */
function truncateTick(v: string): string {
  return v.length > 14 ? `${v.slice(0, 13)}…` : v;
}

/**
 * Categorical breakdown bar chart over the query's first groupBy dimension.
 * When `onSegmentClick` is provided (widget has a `drilldown` config),
 * clicking a bar drills into that category.
 */
export function BarChartWidget({
  data,
  options,
  onSegmentClick,
}: {
  data: DataResult;
  options?: WidgetOptions;
  onSegmentClick?: (value: string) => void;
}) {
  if (data.rows.length === 0) return <EmptyState />;

  const categoryKey = data.columns.find((c) => c.type === "string")?.name ?? "value";
  const color = themeColor(options?.color === "secondary" ? "secondary" : "primary");
  const format = options?.format ?? "currency";
  const valueLabel = options?.valueLabel ?? "Cost";

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden">
      <div
        className="h-full"
        style={{ minWidth: 56 + data.rows.length * MIN_CATEGORY_SLOT_PX }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={chartChrome.gridLine} vertical={false} />
            <XAxis
              dataKey={categoryKey}
              tick={{ fill: chartChrome.axisText, fontSize: 12 }}
              tickFormatter={truncateTick}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tickFormatter={(v: number) => formatValueCompact(v, format)}
              tick={{ fill: chartChrome.axisText, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip
              cursor={{ fill: chartChrome.gridLine, opacity: 0.4 }}
              formatter={(v) => [formatValue(Number(v), format), valueLabel]}
              contentStyle={{
                borderRadius: 8,
                backgroundColor: chartChrome.tooltipBg,
                borderColor: chartChrome.gridLine,
                fontSize: 12,
              }}
              labelStyle={{ color: themeColor("ink") }}
            />
            <Bar
              dataKey="value"
              fill={color}
              radius={[4, 4, 0, 0]}
              maxBarSize={72}
              cursor={onSegmentClick ? "pointer" : undefined}
              onClick={(entry: { payload?: Record<string, string | number> }) => {
                const clicked = entry.payload?.[categoryKey];
                if (onSegmentClick && typeof clicked === "string") onSegmentClick(clicked);
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
