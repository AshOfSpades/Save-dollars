import type { VariableConfig } from "../config/schema";
import { ALL_VALUE } from "../engine/variables";
import { DATE_RANGE_PRESETS } from "../engine/dateRanges";
import { useDashboard } from "../state/DashboardContext";
import { useDistinctValues } from "../hooks/useDistinctValues";
import { TechnicalToggle } from "./TechnicalToggle";

const selectClass =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-ink shadow-xs " +
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

/**
 * Top control bar: renders every variable declared in the dashboard config
 * plus the technical-detail toggle. Controls are config-driven — adding a
 * variable to the config adds a control here with no code change.
 */
export function VariableBar() {
  const { config } = useDashboard();

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      {config.variables.map((variable) =>
        variable.type === "dateRangePreset" ? (
          <DateRangeSelect key={variable.name} variable={variable} />
        ) : (
          <DimensionSelect key={variable.name} variable={variable} />
        )
      )}
      <div className="ml-auto">
        <TechnicalToggle />
      </div>
    </div>
  );
}

function DateRangeSelect({
  variable,
}: {
  variable: Extract<VariableConfig, { type: "dateRangePreset" }>;
}) {
  const { variables, setVariable } = useDashboard();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">{variable.label}</span>
      <select
        className={selectClass}
        value={variables[variable.name]}
        onChange={(e) => setVariable(variable.name, e.target.value)}
      >
        {variable.presets.map((preset) => (
          <option key={preset} value={preset}>
            {DATE_RANGE_PRESETS[preset].label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DimensionSelect({
  variable,
}: {
  variable: Extract<VariableConfig, { type: "dimensionSelect" }>;
}) {
  const { variables, setVariable } = useDashboard();
  // Options come from distinct values in the data — never hardcoded.
  const options = useDistinctValues(variable.field);
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">{variable.label}</span>
      <select
        className={selectClass}
        value={variables[variable.name]}
        onChange={(e) => setVariable(variable.name, e.target.value)}
      >
        {variable.includeAllOption && <option value={ALL_VALUE}>All</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
