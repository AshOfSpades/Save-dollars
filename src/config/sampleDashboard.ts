/**
 * Sample dashboard config (hardcoded for the prototype; would come from
 * storage/API in the real product).
 *
 * Progressive disclosure layout:
 * - depth 0 (landing): month-to-date spend + daily trend + by-Team bar
 * - depth 1 (a team):  MTD vs budget + daily trend + by-application_service
 *   bar + unit economics table (cost per successful transaction per service)
 * - depth 2 (a service): MTD vs budget + daily trend + cost per transaction
 *   (big number + daily trend) + daily transaction volume
 * - any depth, technical toggle on: service_name table + Provider bar
 */

import type { DashboardConfig } from "./schema";

/**
 * Static demo budgets, calibrated against the generated dummy data (org
 * spend is ≈ $1.1k/day). Real budget objects arrive with the pipeline.
 */
const ORG_MONTHLY_BUDGET = 36_000;
const DRILLDOWN_MONTHLY_BUDGET = 6_000;

export const sampleDashboard: DashboardConfig = {
  id: "cost-showback",
  title: "Cloud Cost Showback",
  subtitle: "AWS · Azure · Datadog · MongoDB",
  rootCrumbLabel: "Total spend",
  variables: [
    {
      type: "dateRangePreset",
      name: "dateRange",
      label: "Date range",
      presets: ["last7d", "last14d", "mtd"],
      default: "last14d",
    },
    {
      type: "dimensionSelect",
      name: "environment",
      label: "Environment",
      field: "Environment",
      includeAllOption: true,
      default: "all",
    },
  ],
  grid: { cols: 12, rowHeight: 88 },
  widgets: [
    {
      id: "total-spend-mtd",
      type: "bigNumber",
      title: "Spend this month",
      subtitle: "Month to date",
      audience: "all",
      layout: { x: 0, y: 0, w: 4, h: 3 },
      visibleWhen: { maxDepth: 0 },
      dataSource: {
        query: {
          metric: "sum(Cost)",
          dateRange: { preset: "mtd" },
          filters: [{ field: "Environment", value: "{{environment}}" }],
        },
      },
      options: {
        budget: ORG_MONTHLY_BUDGET,
        budgetLabel: "monthly budget",
        trendWindowDays: 7,
      },
    },
    {
      id: "mtd-vs-budget",
      type: "bigNumber",
      title: "MTD vs budget",
      subtitle: "Static demo target",
      audience: "all",
      layout: { x: 0, y: 0, w: 4, h: 3 },
      visibleWhen: { minDepth: 1 },
      dataSource: {
        query: {
          metric: "sum(Cost)",
          dateRange: { preset: "mtd" },
          filters: [{ field: "Environment", value: "{{environment}}" }],
        },
      },
      options: {
        budget: DRILLDOWN_MONTHLY_BUDGET,
        budgetLabel: "monthly budget",
        trendWindowDays: 7,
      },
    },
    {
      id: "daily-trend",
      type: "lineChart",
      title: "Daily spend",
      subtitle: "Hourly costs summed per calendar day (UTC)",
      audience: "all",
      layout: { x: 4, y: 0, w: 8, h: 3 },
      dataSource: {
        query: {
          metric: "sum(Cost)",
          granularity: "day",
          dateRange: "{{dateRange}}",
          filters: [{ field: "Environment", value: "{{environment}}" }],
        },
      },
    },
    {
      id: "spend-by-team",
      type: "barChart",
      title: "Spend by team",
      subtitle: "Click a bar to drill in",
      audience: "all",
      layout: { x: 0, y: 3, w: 12, h: 3 },
      visibleWhen: { maxDepth: 0 },
      drilldown: { field: "Team" },
      dataSource: {
        query: {
          metric: "sum(Cost)",
          groupBy: ["Team"],
          dateRange: "{{dateRange}}",
          filters: [{ field: "Environment", value: "{{environment}}" }],
        },
      },
    },
    {
      id: "spend-by-service",
      type: "barChart",
      title: "Spend by service",
      subtitle: "Click a bar to drill in",
      audience: "all",
      layout: { x: 0, y: 3, w: 12, h: 3 },
      visibleWhen: { minDepth: 1, maxDepth: 1 },
      drilldown: { field: "application_service" },
      dataSource: {
        query: {
          metric: "sum(Cost)",
          groupBy: ["application_service"],
          dateRange: "{{dateRange}}",
          filters: [{ field: "Environment", value: "{{environment}}" }],
        },
      },
    },
    {
      id: "unit-economics-by-service",
      type: "table",
      title: "Unit economics",
      subtitle: "Cost per successful transaction, by service",
      audience: "all",
      layout: { x: 0, y: 6, w: 12, h: 3 },
      visibleWhen: { minDepth: 1, maxDepth: 1 },
      dataSource: {
        query: {
          metric: "costPerTransaction",
          groupBy: ["application_service", "identified_transaction"],
          dateRange: "{{dateRange}}",
          filters: [{ field: "Environment", value: "{{environment}}" }],
        },
      },
      options: { format: "unitCurrency", valueLabel: "Cost / transaction" },
    },
    {
      id: "cost-per-transaction",
      type: "bigNumber",
      title: "Cost per transaction",
      subtitle: "Spend ÷ successful transactions",
      audience: "all",
      layout: { x: 0, y: 3, w: 4, h: 3 },
      visibleWhen: { minDepth: 2 },
      dataSource: {
        query: {
          metric: "costPerTransaction",
          groupBy: ["identified_transaction"],
          dateRange: "{{dateRange}}",
          filters: [{ field: "Environment", value: "{{environment}}" }],
        },
      },
      options: { format: "unitCurrency", trendWindowDays: 7 },
    },
    {
      id: "cost-per-transaction-daily",
      type: "lineChart",
      title: "Cost per transaction — daily",
      audience: "all",
      layout: { x: 4, y: 3, w: 8, h: 3 },
      visibleWhen: { minDepth: 2 },
      dataSource: {
        query: {
          metric: "costPerTransaction",
          granularity: "day",
          dateRange: "{{dateRange}}",
          filters: [{ field: "Environment", value: "{{environment}}" }],
        },
      },
      options: { format: "unitCurrency", valueLabel: "Cost / transaction" },
    },
    {
      id: "transactions-daily",
      type: "lineChart",
      title: "Successful transactions — daily",
      subtitle: "Business unit metric volume",
      audience: "all",
      layout: { x: 0, y: 6, w: 12, h: 3 },
      visibleWhen: { minDepth: 2 },
      dataSource: {
        query: {
          metric: "sum(Successful_Transactions)",
          granularity: "day",
          dateRange: "{{dateRange}}",
          filters: [{ field: "Environment", value: "{{environment}}" }],
        },
      },
      options: { format: "count", valueLabel: "Transactions", color: "secondary" },
    },
    {
      id: "spend-by-service-name",
      type: "table",
      title: "Spend by service_name",
      subtitle: "Infra-level cost drivers",
      audience: "technical",
      layout: { x: 0, y: 6, w: 7, h: 4 },
      dataSource: {
        query: {
          metric: "sum(Cost)",
          groupBy: ["Provider", "service_name"],
          dateRange: "{{dateRange}}",
          filters: [{ field: "Environment", value: "{{environment}}" }],
        },
      },
    },
    {
      id: "spend-by-provider",
      type: "barChart",
      title: "Spend by provider",
      audience: "technical",
      layout: { x: 7, y: 6, w: 5, h: 4 },
      dataSource: {
        query: {
          metric: "sum(Cost)",
          groupBy: ["Provider"],
          dateRange: "{{dateRange}}",
          filters: [{ field: "Environment", value: "{{environment}}" }],
        },
      },
      options: { color: "secondary" },
    },
  ],
};
