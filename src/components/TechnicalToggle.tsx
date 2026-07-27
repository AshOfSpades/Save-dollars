import { useDashboard } from "../state/DashboardContext";

/**
 * The technical-detail lens. Independent of the breadcrumb trail: flipping
 * it on reveals `audience: "technical"` widgets at the current drill depth.
 * Defaults to off so non-technical users never see infra-level detail.
 */
export function TechnicalToggle() {
  const { technicalDetail, setTechnicalDetail } = useDashboard();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={technicalDetail}
      onClick={() => setTechnicalDetail(!technicalDetail)}
      className="group flex items-center gap-2.5 text-sm"
    >
      <span className={technicalDetail ? "font-medium text-primary" : "text-slate-400"}>
        Technical detail
      </span>
      <span
        className={`flex h-5 w-9 items-center rounded-full px-0.5 transition-colors ${
          technicalDetail ? "bg-primary" : "bg-gray-600 group-hover:bg-gray-500"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
            technicalDetail ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
