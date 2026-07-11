"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Activity, ArrowLeftRight, BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StatsTimeseriesResponse } from "@/types/api";
import type { TimeseriesMetric } from "@/hooks/use-dashboard-stats";

import { formatNumber, getChartTheme, getUpstreamColor } from "./chart-theme";
import { DashboardLoadingBlock, DashboardLoadingSurface } from "./dashboard-loading";

interface UsageChartProps {
  data: StatsTimeseriesResponse | undefined;
  isLoading: boolean;
  timeRange?: string;
  metric: TimeseriesMetric;
  onMetricChange: (metric: TimeseriesMetric) => void;
  displayMode: UsageChartDisplayMode;
  onDisplayModeChange: (mode: UsageChartDisplayMode) => void;
}

interface ChartDataPoint {
  timestamp: string;
  formattedTime: string;
  [key: string]: string | number;
}

interface ChartSeriesDefinition {
  dataKey: string;
  gradientId: string;
  color: string;
  name: string;
}

export type UsageChartDisplayMode = "total" | "byUpstream";

const DISPLAY_MODE_META = {
  total: {
    icon: Activity,
  },
  byUpstream: {
    icon: BarChart3,
  },
} as const;

const METRIC_OPTIONS = ["requests", "tokens", "cost", "ttft", "tps", "duration"] as const;

function formatTtft(ttftMs: number): string {
  if (ttftMs >= 1000) {
    return `${(ttftMs / 1000).toFixed(3)}s`;
  }
  return `${Math.round(ttftMs)}ms`;
}

function formatMetricValue(value: number, metric: TimeseriesMetric): string {
  if (metric === "ttft" || metric === "duration") {
    return formatTtft(value);
  }
  if (metric === "tps") {
    return `${formatNumber(value)} tok/s`;
  }
  if (metric === "cost") {
    return `$${value.toFixed(4)}`;
  }
  return formatNumber(value);
}

function getPointMetricValue(
  point: StatsTimeseriesResponse["total_series"][number],
  metric: TimeseriesMetric
): number {
  switch (metric) {
    case "ttft":
      return point.avg_ttft_ms ?? 0;
    case "tps":
      return point.avg_tps ?? 0;
    case "tokens":
      return point.total_tokens;
    case "duration":
      return point.avg_duration_ms;
    case "cost":
      return point.total_cost ?? 0;
    case "requests":
    default:
      return point.request_count;
  }
}

function CustomTooltip({
  active,
  payload,
  label,
  mode,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; type?: string }>;
  label?: string;
  mode: "dark" | "light";
  metric: TimeseriesMetric;
}) {
  // recharts 只在默认 content 里过滤 tooltipType="none" 的系列；自定义
  // content 收到的是未过滤 payload，需要自己排除（总量模式的趋势 Area）。
  const entries = payload?.filter((entry) => entry.type !== "none") ?? [];

  if (!active || !entries.length) {
    return null;
  }

  const theme = getChartTheme(mode);

  return (
    <div
      className="min-w-[180px] rounded-cf-md border p-3 shadow-[var(--vr-shadow-md)]"
      style={{
        background: theme.colors.tooltip.background,
        borderColor: theme.colors.tooltip.border,
      }}
    >
      <p className="type-label-medium mb-2" style={{ color: theme.colors.text }}>
        {label}
      </p>
      {entries.map((entry) => (
        <div key={entry.name} className="mb-1.5 flex items-center gap-2 last:mb-0">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="type-body-small" style={{ color: theme.colors.textStrong }}>
            {entry.name}: {formatMetricValue(entry.value, metric)}
          </span>
        </div>
      ))}
    </div>
  );
}

function CustomLegend({
  payload,
  mode,
}: {
  payload?: Array<{ value: string; color: string; type?: string }>;
  mode: "dark" | "light";
}) {
  // 同 CustomTooltip：legendType="none" 的过滤要在自定义 content 里自己做。
  const entries = payload?.filter((entry) => entry.type !== "none") ?? [];

  if (!entries.length) {
    return null;
  }

  const theme = getChartTheme(mode);

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-3">
      {entries.map((entry) => (
        <div key={entry.value} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="type-body-small" style={{ color: theme.colors.text }}>
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function UsageSummaryLoading({ loadingLabel }: { loadingLabel: string }) {
  return (
    <DashboardLoadingSurface
      loadingLabel={loadingLabel}
      data-testid="usage-chart-summary-loading"
      className="mt-1 flex items-end gap-2"
    >
      <DashboardLoadingBlock tone="accent" className="h-6 w-14" />
      <DashboardLoadingBlock tone="muted" className="mb-0.5 h-3 w-10" />
    </DashboardLoadingSurface>
  );
}

function UsageChartLoading({ loadingLabel }: { loadingLabel: string }) {
  return (
    <DashboardLoadingSurface
      loadingLabel={loadingLabel}
      data-testid="usage-chart-loading-skeleton"
      className="flex h-full w-full flex-col gap-4 rounded-cf-md border border-divider/75 bg-surface-200/55 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <DashboardLoadingBlock className="h-3 w-16" />
          <DashboardLoadingBlock className="h-3 w-12" />
          <DashboardLoadingBlock className="h-3 w-14" />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 rounded-cf-sm border border-divider/70 bg-surface-300/45 p-1">
            <DashboardLoadingBlock tone="accent" className="h-7 w-16" />
            <DashboardLoadingBlock className="h-7 w-14" />
            <DashboardLoadingBlock className="h-7 w-12" />
          </div>
          <div className="flex items-center gap-1.5 rounded-cf-sm border border-divider/70 bg-surface-300/45 p-1">
            <DashboardLoadingBlock tone="accent" className="h-7 w-16" />
            <DashboardLoadingBlock className="h-7 w-16" />
          </div>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-cf-md border border-divider/65 bg-card/55 p-3">
        <div className="flex flex-col justify-between py-1.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <DashboardLoadingBlock key={`usage-chart-axis-${index}`} className="h-2.5 w-full" />
          ))}
        </div>

        <div className="relative overflow-hidden rounded-cf-sm border border-divider/60 bg-surface-200/40 px-3 pb-3 pt-4">
          <div className="absolute inset-x-0 top-4 h-px bg-divider/55" />
          <div className="absolute inset-x-0 top-1/2 h-px bg-divider/45" />
          <div className="absolute inset-x-0 bottom-9 h-px bg-divider/55" />
          <div className="absolute inset-y-0 left-0 w-px bg-divider/50" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-divider/60" />

          <div className="grid h-full grid-cols-8 items-end gap-2">
            {["35%", "52%", "44%", "68%", "58%", "76%", "63%", "81%"].map((height, index) => (
              <DashboardLoadingBlock
                key={`usage-chart-bar-${index}`}
                tone={index % 3 === 0 ? "accent" : "default"}
                className="w-full"
                style={{ height }}
              />
            ))}
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <DashboardLoadingBlock key={`usage-chart-label-${index}`} className="h-2.5 w-full" />
            ))}
          </div>
        </div>
      </div>
    </DashboardLoadingSurface>
  );
}

export function UsageChart({
  data,
  isLoading,
  metric,
  onMetricChange,
  displayMode,
  onDisplayModeChange,
}: UsageChartProps) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const { resolvedTheme } = useTheme();
  const mode = resolvedTheme === "light" ? "light" : "dark";
  const theme = getChartTheme(mode);

  const displayModeLabels: Record<UsageChartDisplayMode, string> = {
    total: t("stats.chartModeTotal"),
    byUpstream: t("stats.chartModeByUpstream"),
  };

  const metricLabels: Record<TimeseriesMetric, string> = {
    requests: t("stats.chartTabRequests"),
    tokens: t("stats.chartTabTokens"),
    cost: t("stats.chartTabCost"),
    ttft: t("stats.chartTabTtft"),
    tps: t("stats.chartTabTps"),
    duration: t("stats.chartTabDuration"),
  };

  const { chartData, seriesDefinitions } = useMemo(() => {
    if (!data) {
      return {
        chartData: [] as ChartDataPoint[],
        seriesDefinitions: [] as ChartSeriesDefinition[],
      };
    }

    if (displayMode === "total") {
      const totalSeries = data.total_series ?? [];
      if (!totalSeries.length) {
        return {
          chartData: [] as ChartDataPoint[],
          seriesDefinitions: [] as ChartSeriesDefinition[],
        };
      }

      return {
        chartData: totalSeries.map((point) => {
          const date = parseISO(point.timestamp);
          return {
            timestamp: point.timestamp,
            formattedTime:
              data.granularity === "hour" ? format(date, "HH:mm") : format(date, "MM/dd"),
            totalValue: getPointMetricValue(point, metric),
          };
        }),
        seriesDefinitions: [
          {
            dataKey: "totalValue",
            gradientId: "usage-gradient-total",
            color: getUpstreamColor(0, mode),
            name: t("stats.chartModeTotal"),
          },
        ],
      };
    }

    if (!data.series?.length) {
      return {
        chartData: [] as ChartDataPoint[],
        seriesDefinitions: [] as ChartSeriesDefinition[],
      };
    }

    const timestampMap = new Map<string, ChartDataPoint>();
    const nextSeriesDefinitions = data.series.map((series, index) => ({
      dataKey: `series_${series.upstream_id ?? "unknown"}_${index}`,
      gradientId: `usage-gradient-${series.upstream_id ?? "unknown"}-${index}`,
      color: getUpstreamColor(index, mode),
      name: series.upstream_name,
    }));

    data.series.forEach((series, index) => {
      const definition = nextSeriesDefinitions[index];

      series.data.forEach((point) => {
        const key = point.timestamp;
        if (!timestampMap.has(key)) {
          const date = parseISO(point.timestamp);
          timestampMap.set(key, {
            timestamp: key,
            formattedTime:
              data.granularity === "hour" ? format(date, "HH:mm") : format(date, "MM/dd"),
          });
        }

        const row = timestampMap.get(key);
        if (!row) {
          return;
        }

        row[definition.dataKey] = getPointMetricValue(point, metric);
      });
    });

    for (const row of timestampMap.values()) {
      for (const definition of nextSeriesDefinitions) {
        if (row[definition.dataKey] === undefined) {
          row[definition.dataKey] = 0;
        }
      }
    }

    return {
      chartData: Array.from(timestampMap.values()).sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ),
      seriesDefinitions: nextSeriesDefinitions,
    };
  }, [data, displayMode, metric, mode, t]);

  // Exact whole-period aggregates computed server-side: bucket averages only
  // cover successful requests, so re-deriving a period mean from them with
  // request-count weights would be wrong.
  const summary = data?.period_summary;

  const requestsSummaryItem = {
    key: "requests",
    label: t("stats.totalRequests"),
    value: formatNumber(summary?.request_count ?? 0),
  };
  const tokensSummaryItem = {
    key: "tokens",
    label: t("stats.totalTokensUsed"),
    value: formatNumber(summary?.total_tokens ?? 0),
  };

  const metricSummaryItem = (() => {
    switch (metric) {
      case "tokens":
        return tokensSummaryItem;
      case "cost":
        return {
          key: "cost",
          label: t("stats.totalCostUsed"),
          value: formatMetricValue(summary?.total_cost ?? 0, "cost"),
        };
      case "ttft":
      case "tps":
      case "duration":
        return {
          key: metric,
          label: metricLabels[metric],
          value: formatMetricValue(
            metric === "ttft"
              ? (summary?.avg_ttft_ms ?? 0)
              : metric === "tps"
                ? (summary?.avg_tps ?? 0)
                : (summary?.avg_duration_ms ?? 0),
            metric
          ),
        };
      case "requests":
      default:
        return requestsSummaryItem;
    }
  })();

  const summaryItems = [
    metricSummaryItem,
    metric === "requests" ? tokensSummaryItem : requestsSummaryItem,
  ] as const;

  const chartHeightClass =
    isLoading || chartData.length > 0 ? "h-[280px] sm:h-[320px]" : "h-[200px] sm:h-[220px]";

  const currentDisplayModeLabel = displayModeLabels[displayMode];
  const nextDisplayMode: UsageChartDisplayMode = displayMode === "total" ? "byUpstream" : "total";
  const totalSeries = displayMode === "total" ? seriesDefinitions[0] : undefined;
  const CurrentDisplayModeIcon = DISPLAY_MODE_META[displayMode].icon;

  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="type-title-medium text-foreground">{t("stats.usageStatistics")}</h3>
          </div>

          <div className="flex flex-wrap items-end gap-x-5 gap-y-2 sm:justify-end">
            {summaryItems.map((item, index) => (
              <div key={item.key} className="flex items-end gap-3">
                {index > 0 ? <div className="hidden h-7 w-px bg-divider/75 sm:block" /> : null}
                <div>
                  <p className="type-caption tracking-[0.08em] text-muted-foreground/80">
                    {item.label}
                  </p>
                  {isLoading ? (
                    <UsageSummaryLoading loadingLabel={tCommon("loading")} />
                  ) : (
                    <p className="mt-1 type-title-medium text-foreground">{item.value}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-y border-divider/60 bg-surface-200/20 py-2.5">
          <div className="flex flex-wrap items-center gap-3 lg:gap-4">
            <div className="inline-flex w-fit lg:shrink-0">
              <button
                onClick={() => onDisplayModeChange(nextDisplayMode)}
                aria-label={currentDisplayModeLabel}
                title={displayModeLabels[nextDisplayMode]}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 type-label-medium text-amber-500 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--vr-accent-500)_18%,transparent)] transition-all hover:bg-amber-500/20"
              >
                <CurrentDisplayModeIcon className="h-3 w-3" />
                <span>{currentDisplayModeLabel}</span>
                <ArrowLeftRight className="h-3 w-3 text-amber-500/80" />
              </button>
            </div>

            <div className="hidden h-5 w-px bg-divider/75 lg:block" />

            <div className="flex min-w-0 flex-1 flex-wrap items-center">
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {METRIC_OPTIONS.map((m) => {
                  return (
                    <button
                      key={m}
                      onClick={() => onMetricChange(m)}
                      aria-pressed={metric === m}
                      className={cn(
                        "rounded-full px-2.5 py-1 type-label-medium transition-all",
                        metric === m
                          ? "bg-amber-500/15 text-amber-500 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--vr-accent-500)_18%,transparent)]"
                          : "text-muted-foreground hover:bg-surface-200/65 hover:text-foreground"
                      )}
                    >
                      {metricLabels[m]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className={cn(chartHeightClass, "w-full min-w-0")}>
          {isLoading ? (
            <UsageChartLoading loadingLabel={tCommon("loading")} />
          ) : chartData.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center">
              <p className="type-body-medium text-muted-foreground">{t("stats.noData")}</p>
            </div>
          ) : (
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 1, height: 280 }}
            >
              <ComposedChart data={chartData} margin={theme.spacing.margin}>
                {displayMode === "total" && (
                  <defs>
                    {seriesDefinitions.map((series) => {
                      return (
                        <linearGradient
                          key={series.gradientId}
                          id={series.gradientId}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor={series.color}
                            stopOpacity={theme.area.opacityStart}
                          />
                          <stop
                            offset="95%"
                            stopColor={series.color}
                            stopOpacity={theme.area.opacityEnd}
                          />
                        </linearGradient>
                      );
                    })}
                  </defs>
                )}

                <CartesianGrid strokeDasharray="4 4" stroke={theme.colors.grid} vertical={false} />
                <XAxis
                  dataKey="formattedTime"
                  tick={{ fill: theme.colors.text, fontSize: 10 }}
                  tickLine={{ stroke: theme.colors.grid }}
                  axisLine={{ stroke: theme.colors.grid }}
                  style={{ fontFamily: theme.fonts.mono }}
                />
                <YAxis
                  tick={{ fill: theme.colors.text, fontSize: 10 }}
                  tickLine={{ stroke: theme.colors.grid }}
                  axisLine={{ stroke: theme.colors.grid }}
                  domain={[0, "auto"]}
                  tickFormatter={(v: number) =>
                    metric === "ttft" || metric === "duration"
                      ? formatTtft(v)
                      : metric === "tps"
                        ? `${formatNumber(v)}`
                        : metric === "cost"
                          ? `$${v.toFixed(2)}`
                          : formatNumber(v)
                  }
                  style={{ fontFamily: theme.fonts.mono }}
                  width={theme.spacing.yAxisWidth}
                />

                <Tooltip content={<CustomTooltip mode={mode} metric={metric} />} />
                <Legend content={<CustomLegend mode={mode} />} />

                {/* 总量模式 = 柱 + 面积线：柱承载逐桶读数，面积线勾勒趋势。
                    Area 与 Bar 共用同一 dataKey，故 Area 从 tooltip/legend 中
                    排除，避免同一数值出现两条目。 */}
                {totalSeries && (
                  <Bar
                    dataKey={totalSeries.dataKey}
                    name={totalSeries.name}
                    fill={totalSeries.color}
                    fillOpacity={theme.bar.opacity}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={28}
                  />
                )}
                {totalSeries && (
                  <Area
                    type="monotone"
                    dataKey={totalSeries.dataKey}
                    stroke={totalSeries.color}
                    strokeWidth={2}
                    fill={`url(#${totalSeries.gradientId})`}
                    fillOpacity={1}
                    tooltipType="none"
                    legendType="none"
                  />
                )}
                {/* 按上游模式 = 堆叠柱，总高即总量，分段直读各上游占比。 */}
                {displayMode === "byUpstream" &&
                  seriesDefinitions.map((series) => (
                    <Bar
                      key={series.dataKey}
                      dataKey={series.dataKey}
                      name={series.name}
                      stackId="upstreams"
                      fill={series.color}
                      fillOpacity={0.85}
                      maxBarSize={28}
                    />
                  ))}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
