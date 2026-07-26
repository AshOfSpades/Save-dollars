/**
 * Dummy cost data generator.
 *
 * Writes public/data/costs.csv — 14 days of hourly cost rows shaped like our
 * raw multi-cloud cost export (NOT FOCUS-normalized; that happens in the real
 * pipeline later). Columns:
 *
 *   Provider, service_name, application_service, Cost, Environment, Team,
 *   Date, Account_ID
 *
 * The data is generated relative to "now", so re-run this script
 * (`npm run generate:data`) whenever the committed CSV gets stale.
 *
 * Row volume is kept sane for client-side parsing by NOT cross-joining every
 * dimension: each (team, application_service, provider, service_name,
 * environment) combination is an explicit "cost stream" below, and non-prod
 * streams only emit rows during weekday working hours.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "costs.csv");

const DAYS = 14;
const HOUR_MS = 3_600_000;

/** Deterministic PRNG so re-runs with the same clock hour are reproducible. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AWS_ACCOUNTS = {
  payments: "111122223333",
  search: "444455556666",
  platform: "777788889999",
};
const AZURE_SUBS = {
  search: "azr-sub-search-7f2e",
  platform: "azr-sub-platform-9c1a",
  growth: "azr-sub-growth-3b8d",
};
const DATADOG_ORG = "dd-org-main";
const MONGO_ORGS = {
  payments: "atlas-org-payments",
  platform: "atlas-org-platform",
  growth: "atlas-org-growth",
};

/**
 * Cost streams: one entry per (provider, service_name, environment) that an
 * application service actually spends money on. `base` is the average hourly
 * cost in dollars.
 */
const STREAMS = [
  // ---- payments ------------------------------------------------------------
  { team: "payments", app: "checkout-api", provider: "AWS", service: "EC2", env: "prod", base: 6.5 },
  { team: "payments", app: "checkout-api", provider: "AWS", service: "EC2", env: "staging", base: 1.4 },
  { team: "payments", app: "checkout-api", provider: "AWS", service: "EC2", env: "dev1", base: 0.55 },
  { team: "payments", app: "checkout-api", provider: "AWS", service: "RDS", env: "prod", base: 3.2 },
  { team: "payments", app: "checkout-api", provider: "Datadog", service: "apm_fargate_task", env: "prod", base: 1.1 },
  { team: "payments", app: "checkout-api", provider: "MongoDB", service: "atlas_cluster", env: "prod", base: 2.4 },
  { team: "payments", app: "checkout-api", provider: "MongoDB", service: "atlas_cluster", env: "staging", base: 0.5 },
  { team: "payments", app: "billing-worker", provider: "AWS", service: "EC2", env: "prod", base: 2.2 },
  { team: "payments", app: "billing-worker", provider: "AWS", service: "EC2", env: "dev1", base: 0.4 },
  { team: "payments", app: "billing-worker", provider: "AWS", service: "CloudWatch", env: "prod", base: 0.5 },
  { team: "payments", app: "billing-worker", provider: "MongoDB", service: "atlas_backup", env: "prod", base: 0.35 },
  { team: "payments", app: "fraud-scoring", provider: "AWS", service: "EC2", env: "prod", base: 3.8 },
  { team: "payments", app: "fraud-scoring", provider: "AWS", service: "EC2", env: "staging", base: 0.9 },
  { team: "payments", app: "fraud-scoring", provider: "Datadog", service: "custom_metrics", env: "prod", base: 0.6 },
  // ---- search ---------------------------------------------------------------
  { team: "search", app: "search-api", provider: "AWS", service: "EC2", env: "prod", base: 4.2 },
  { team: "search", app: "search-api", provider: "AWS", service: "EC2", env: "staging", base: 1.0 },
  { team: "search", app: "search-api", provider: "Datadog", service: "log_ingested", env: "prod", base: 0.9 },
  { team: "search", app: "indexer", provider: "AWS", service: "EC2", env: "prod", base: 2.8 },
  { team: "search", app: "indexer", provider: "AWS", service: "EC2", env: "dev2", base: 0.5 },
  { team: "search", app: "indexer", provider: "Azure", service: "BlobStorage", env: "prod", base: 0.8 },
  // ---- platform ---------------------------------------------------------------
  { team: "platform", app: "api-gateway", provider: "AWS", service: "EC2", env: "prod", base: 5.0 },
  { team: "platform", app: "api-gateway", provider: "AWS", service: "EC2", env: "staging", base: 1.2 },
  { team: "platform", app: "api-gateway", provider: "Datadog", service: "log_ingested", env: "prod", base: 1.3 },
  { team: "platform", app: "api-gateway", provider: "Azure", service: "AzureMonitor", env: "prod", base: 0.4 },
  { team: "platform", app: "auth-service", provider: "Azure", service: "VirtualMachines", env: "prod", base: 2.1 },
  { team: "platform", app: "auth-service", provider: "Azure", service: "VirtualMachines", env: "staging", base: 0.6 },
  { team: "platform", app: "auth-service", provider: "Azure", service: "VirtualMachines", env: "dev1", base: 0.3 },
  { team: "platform", app: "auth-service", provider: "MongoDB", service: "atlas_cluster", env: "prod", base: 0.9 },
  // ---- growth ---------------------------------------------------------------
  { team: "growth", app: "recommendations", provider: "Azure", service: "VirtualMachines", env: "prod", base: 3.4 },
  { team: "growth", app: "recommendations", provider: "Azure", service: "VirtualMachines", env: "dev1", base: 0.7 },
  { team: "growth", app: "recommendations", provider: "Azure", service: "BlobStorage", env: "prod", base: 1.2 },
  { team: "growth", app: "recommendations", provider: "MongoDB", service: "atlas_cluster", env: "prod", base: 1.5 },
  { team: "growth", app: "email-service", provider: "Azure", service: "VirtualMachines", env: "prod", base: 1.1 },
  { team: "growth", app: "email-service", provider: "Datadog", service: "log_ingested", env: "prod", base: 0.4 },
];

/** Usage-driven services swing with traffic; the rest bill near-flat. */
const DIURNAL_SERVICES = new Set([
  "EC2",
  "CloudWatch",
  "log_ingested",
  "apm_fargate_task",
  "custom_metrics",
  "AzureMonitor",
]);

/** Per-team day-over-day growth, so the demo has a story to drill into. */
const TEAM_DAILY_TREND = { payments: 0.008, search: 0.0, platform: -0.004, growth: 0.025 };

function accountId(stream) {
  switch (stream.provider) {
    case "AWS":
      return AWS_ACCOUNTS[stream.team];
    case "Azure":
      return AZURE_SUBS[stream.team];
    case "Datadog":
      return DATADOG_ORG;
    case "MongoDB":
      return MONGO_ORGS[stream.team];
  }
}

function main() {
  const rng = mulberry32(42);
  const endMs = Math.floor(Date.now() / HOUR_MS) * HOUR_MS; // start of current hour, exclusive
  const startMs = endMs - DAYS * 24 * HOUR_MS;

  const lines = ["Provider,service_name,application_service,Cost,Environment,Team,Date,Account_ID"];
  const teamTotals = {};

  for (const stream of STREAMS) {
    const account = accountId(stream);
    for (let ts = startMs; ts < endMs; ts += HOUR_MS) {
      const d = new Date(ts);
      const hour = d.getUTCHours();
      const weekday = d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
      // Non-prod capacity only runs during weekday working hours.
      if (stream.env !== "prod" && (!weekday || hour < 7 || hour >= 19)) continue;

      const dayIndex = Math.floor((ts - startMs) / (24 * HOUR_MS));
      let factor = 1 + TEAM_DAILY_TREND[stream.team] * dayIndex;
      if (DIURNAL_SERVICES.has(stream.service)) {
        factor *= 0.8 + 0.45 * Math.max(0, Math.sin(((hour - 7) / 12) * Math.PI));
        if (!weekday) factor *= 0.7;
      } else if (!weekday) {
        factor *= 0.95;
      }
      factor *= 0.9 + rng() * 0.2; // per-hour noise

      const cost = (stream.base * factor).toFixed(4);
      teamTotals[stream.team] = (teamTotals[stream.team] ?? 0) + Number(cost);
      lines.push(
        [
          stream.provider,
          stream.service,
          stream.app,
          cost,
          stream.env,
          stream.team,
          new Date(ts).toISOString().replace(".000Z", "Z"),
          account,
        ].join(",")
      );
    }
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, lines.join("\n") + "\n");

  const total = Object.values(teamTotals).reduce((a, b) => a + b, 0);
  console.log(`Wrote ${lines.length - 1} rows to ${OUT_PATH}`);
  console.log(`Range: ${new Date(startMs).toISOString()} .. ${new Date(endMs).toISOString()} (exclusive)`);
  console.log(`14-day total: $${total.toFixed(2)}`);
  for (const [team, t] of Object.entries(teamTotals).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${team.padEnd(10)} $${t.toFixed(2)}`);
  }
}

main();
