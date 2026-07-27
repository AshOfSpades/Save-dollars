import { Fragment } from "react";
import { useDashboard } from "../state/DashboardContext";

/**
 * Drill-down trail, e.g. "Total spend > payments > checkout-api".
 * Clicking an earlier crumb truncates the trail back to that point,
 * un-filtering every widget on the dashboard.
 */
export function Breadcrumb() {
  const { crumbs, jumpToCrumb } = useDashboard();

  return (
    <nav aria-label="Drill-down trail" className="flex flex-wrap items-center gap-1.5 text-sm">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <Fragment key={i}>
            {i > 0 && (
              <svg
                className="h-3.5 w-3.5 text-slate-400"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
              >
                <path
                  d="M6 3.5 10.5 8 6 12.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {isLast ? (
              <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                {crumb.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => jumpToCrumb(i)}
                className="rounded-md px-2 py-0.5 text-slate-300 hover:bg-gray-700 hover:text-secondary"
              >
                {crumb.label}
              </button>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
