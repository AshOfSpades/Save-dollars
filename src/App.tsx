import { useMemo } from "react";
import { CsvAdapter } from "./adapters/CsvAdapter";
import { sampleDashboard } from "./config/sampleDashboard";
import { DashboardProvider } from "./state/DashboardContext";
import { DashboardShell } from "./components/DashboardShell";

export default function App() {
  // Swap this for an ApiAdapter when the real pipeline exists — nothing
  // below the provider changes.
  const adapter = useMemo(
    () =>
      new CsvAdapter(
        `${import.meta.env.BASE_URL}data/costs.csv`,
        `${import.meta.env.BASE_URL}data/business_metrics.csv`
      ),
    []
  );

  return (
    <DashboardProvider config={sampleDashboard} adapter={adapter}>
      <DashboardShell />
    </DashboardProvider>
  );
}
