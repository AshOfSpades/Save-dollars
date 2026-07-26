/**
 * Dummy data generator. Writes two timeline-aligned CSVs (past 14 days,
 * hourly, generated relative to "now" — re-run via `npm run generate:data`
 * whenever the committed files get stale):
 *
 * 1. public/data/costs.csv — raw multi-cloud cost export (NOT
 *    FOCUS-normalized; that happens in the real pipeline later):
 *
 *      Provider, service_name, application_service, Cost, Environment, Team,
 *      Date, Account_ID
 *
 * 2. public/data/business_metrics.csv — business unit metrics per
 *    microservice, correlatable with cost rows on
 *    (Service_Name = application_service, Environment, hour):
 *
 *      Time_Stamp, Environment, Service_Name, identified_transaction,
 *      Successful_Transactions
 *
 * Row volume is kept sane for client-side parsing by NOT cross-joining every
 * dimension: each combination is an explicit "stream" below, and non-prod
 * streams only emit rows during weekday working hours.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const COSTS_PATH = join(DATA_DIR, "costs.csv");
const METRICS_PATH = join(DATA_DIR, "business_metrics.csv");

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

/**
 * Business unit metric per microservice (different services have different
 * identified transactions). `base` is average successful transactions per
 * hour in prod; `envs` scales volume for each environment the service emits
 * metrics in. Transaction volume trends slightly slower than the team's cost
 * trend, so cost-per-transaction drifts — that's the insight to demo.
 */
const TRANSACTION_STREAMS = [
  { team: "payments", app: "checkout-api", metric: "Order processed", base: 900, envs: { prod: 1, staging: 0.05 } },
  { team: "payments", app: "billing-worker", metric: "Invoice generated", base: 220, envs: { prod: 1 } },
  { team: "payments", app: "fraud-scoring", metric: "Fraud check completed", base: 850, envs: { prod: 1, staging: 0.05 } },
  { team: "search", app: "search-api", metric: "Search completed", base: 4200, envs: { prod: 1, staging: 0.04 } },
  { team: "search", app: "indexer", metric: "Document indexed", base: 1500, envs: { prod: 1, dev2: 0.03 } },
  { team: "platform", app: "api-gateway", metric: "Partner API call served", base: 11000, envs: { prod: 1, staging: 0.05 } },
  { team: "platform", app: "auth-service", metric: "Login completed", base: 700, envs: { prod: 1, staging: 0.05, dev1: 0.02 } },
  { team: "growth", app: "recommendations", metric: "Recommendation served", base: 2600, envs: { prod: 1, dev1: 0.03 } },
  { team: "growth", app: "email-service", metric: "Email delivered", base: 640, envs: { prod: 1 } },
];

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

function isoHour(ts) {
  return new Date(ts).toISOString().replace(".000Z", "Z");
}

function writeCosts(rng, startMs, endMs) {
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
        [stream.provider, stream.service, stream.app, cost, stream.env, stream.team, isoHour(ts), account].join(",")
      );
    }
  }

  writeFileSync(COSTS_PATH, lines.join("\n") + "\n");
  console.log(`Wrote ${lines.length - 1} cost rows to ${COSTS_PATH}`);
  const total = Object.values(teamTotals).reduce((a, b) => a + b, 0);
  console.log(`14-day total: $${total.toFixed(2)}`);
  for (const [team, t] of Object.entries(teamTotals).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${team.padEnd(10)} $${t.toFixed(2)}`);
  }
}

function writeBusinessMetrics(rng, startMs, endMs) {
  const lines = ["Time_Stamp,Environment,Service_Name,identified_transaction,Successful_Transactions"];

  for (const stream of TRANSACTION_STREAMS) {
    for (const [env, scale] of Object.entries(stream.envs)) {
      for (let ts = startMs; ts < endMs; ts += HOUR_MS) {
        const d = new Date(ts);
        const hour = d.getUTCHours();
        const weekday = d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
        if (env !== "prod" && (!weekday || hour < 7 || hour >= 19)) continue;

        const dayIndex = Math.floor((ts - startMs) / (24 * HOUR_MS));
        // Volume grows slower than the team's cost trend -> unit cost drifts.
        let factor = 1 + TEAM_DAILY_TREND[stream.team] * 0.6 * dayIndex;
        factor *= 0.8 + 0.45 * Math.max(0, Math.sin(((hour - 7) / 12) * Math.PI));
        if (!weekday) factor *= 0.75;
        factor *= 0.9 + rng() * 0.2;

        const tx = Math.max(0, Math.round(stream.base * scale * factor));
        lines.push([isoHour(ts), env, stream.app, stream.metric, tx].join(","));
      }
    }
  }

  writeFileSync(METRICS_PATH, lines.join("\n") + "\n");
  console.log(`Wrote ${lines.length - 1} business metric rows to ${METRICS_PATH}`);
}

function main() {
  const endMs = Math.floor(Date.now() / HOUR_MS) * HOUR_MS; // start of current hour, exclusive
  const startMs = endMs - DAYS * 24 * HOUR_MS;
  mkdirSync(DATA_DIR, { recursive: true });

  console.log(`Range: ${new Date(startMs).toISOString()} .. ${new Date(endMs).toISOString()} (exclusive)`);
  writeCosts(mulberry32(42), startMs, endMs);
  writeBusinessMetrics(mulberry32(1337), startMs, endMs);
}

main();
