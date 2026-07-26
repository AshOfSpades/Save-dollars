import { useMemo } from "react";
import type { WidgetConfig } from "../config/schema";
import { useDashboard } from "../state/DashboardContext";
import { VariableBar } from "./VariableBar";
import { Breadcrumb } from "./Breadcrumb";
import { DashboardGrid } from "./DashboardGrid";

/**
 * Puts the dashboard together: header, VariableBar (variables + technical
 * toggle), breadcrumb trail, and the widget grid. Decides which widgets are
 * visible from two independent axes:
 *
 * - audience: `"technical"` widgets need the detail toggle ON
 * - visibleWhen: min/max drill depth from the breadcrumb trail
 */
export function DashboardShell() {
  const { config, technicalDetail, drillDepth } = useDashboard();

  const visibleWidgets = useMemo(
    () =>
      config.widgets.filter((w: WidgetConfig) => {
        if (w.audience === "technical" && !technicalDetail) return false;
        const { minDepth = 0, maxDepth = Infinity } = w.visibleWhen ?? {};
        return drillDepth >= minDepth && drillDepth <= maxDepth;
      }),
    [config.widgets, technicalDetail, drillDepth]
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink">{config.title}</h1>
            {config.subtitle && <p className="text-xs text-slate-500">{config.subtitle}</p>}
          </div>
          <span className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
            Prototype · local CSV data
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-6 py-5">
        <VariableBar />
        <Breadcrumb />
        <DashboardGrid widgets={visibleWidgets} />
      </main>
    </div>
  );
}
