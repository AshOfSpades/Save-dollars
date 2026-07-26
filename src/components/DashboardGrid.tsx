import { useState } from "react";
import { GridLayout, useContainerWidth, type Layout, type LayoutItem } from "react-grid-layout";
import type { WidgetConfig } from "../config/schema";
import { useDashboard } from "../state/DashboardContext";
import { WidgetRenderer } from "./WidgetRenderer";

/**
 * Positions the currently visible widgets with react-grid-layout, using the
 * positions from the dashboard config. Widgets can be dragged (by their
 * header) and resized; user adjustments are kept in memory per widget id.
 */
export function DashboardGrid({ widgets }: { widgets: WidgetConfig[] }) {
  const { config } = useDashboard();
  const { width, containerRef, mounted } = useContainerWidth();
  const [overrides, setOverrides] = useState<Record<string, LayoutItem>>({});

  const layout: Layout = widgets.map(
    (w) => overrides[w.id] ?? { i: w.id, ...w.layout }
  );

  const handleLayoutChange = (next: Layout) => {
    setOverrides((prev) => {
      const merged = { ...prev };
      for (const item of next) merged[item.i] = item;
      return merged;
    });
  };

  return (
    <div ref={containerRef}>
      {mounted && width > 0 && (
        <GridLayout
          width={width}
          layout={layout}
          gridConfig={{
            cols: config.grid.cols,
            rowHeight: config.grid.rowHeight,
            margin: [16, 16],
            containerPadding: [0, 0],
          }}
          dragConfig={{ handle: ".widget-drag-handle" }}
          onLayoutChange={handleLayoutChange}
        >
          {widgets.map((widget) => (
            <div key={widget.id}>
              <WidgetRenderer widget={widget} />
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  );
}
