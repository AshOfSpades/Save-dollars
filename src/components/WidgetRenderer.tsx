import { useCallback } from "react";
import type { WidgetConfig } from "../config/schema";
import { useWidgetData } from "../hooks/useWidgetData";
import { useDashboard } from "../state/DashboardContext";
import { WidgetFrame } from "./WidgetFrame";
import { BigNumberWidget } from "./widgets/BigNumberWidget";
import { LineChartWidget } from "./widgets/LineChartWidget";
import { BarChartWidget } from "./widgets/BarChartWidget";
import { TableWidget } from "./widgets/TableWidget";

/**
 * Renders one configured widget: runs its (variable- and breadcrumb-
 * resolved) query via useWidgetData and switches on `widget.type`. Adding a
 * new widget type = add a case here + a small presentational component;
 * nothing about data access changes.
 */
export function WidgetRenderer({ widget }: { widget: WidgetConfig }) {
  const { data, trend, loading, error } = useWidgetData(widget);
  const { drillDown } = useDashboard();

  const drillField = widget.drilldown?.field;
  const handleSegmentClick = useCallback(
    (value: string) => {
      if (drillField) {
        drillDown({ label: value, filter: { field: drillField, value } });
      }
    },
    [drillDown, drillField]
  );

  return (
    <WidgetFrame title={widget.title} subtitle={widget.subtitle} loading={loading} error={error}>
      {data &&
        (() => {
          switch (widget.type) {
            case "bigNumber":
              return <BigNumberWidget data={data} trend={trend} options={widget.options} />;
            case "lineChart":
              return <LineChartWidget widgetId={widget.id} data={data} options={widget.options} />;
            case "barChart":
              return (
                <BarChartWidget
                  data={data}
                  options={widget.options}
                  onSegmentClick={drillField ? handleSegmentClick : undefined}
                />
              );
            case "table":
              return <TableWidget data={data} options={widget.options} />;
          }
        })()}
    </WidgetFrame>
  );
}
