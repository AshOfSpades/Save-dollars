import type { ReactNode } from "react";

/**
 * Card chrome shared by every widget: title/subtitle header (which doubles
 * as the drag handle for react-grid-layout) plus loading/error/empty states.
 */
export function WidgetFrame({
  title,
  subtitle,
  loading,
  error,
  children,
}: {
  title: string;
  subtitle?: string;
  loading: boolean;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-800 shadow-sm">
      <div className="widget-drag-handle cursor-move select-none px-4 pt-3 pb-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
      <div className="min-h-0 flex-1 px-4 pb-4">
        {loading ? (
          <div className="flex h-full flex-col justify-center gap-2">
            <div className="h-3 w-2/3 animate-pulse rounded bg-gray-700" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-gray-700" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-gray-700" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-danger">
            {error}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">
      No data for this selection
    </div>
  );
}
