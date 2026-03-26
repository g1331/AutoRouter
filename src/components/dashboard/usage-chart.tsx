"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  Area,
  AreaChart,
  CartesianGrid,
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
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  mode: "dark" | "light";
  metric: TimeseriesMetric;
}) {
  if (!active || !payload?.length) {
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
      {payload.map((entry) => (
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
  payload?: Array<{ value: string; color: string }>;
  mode: "dark" | "light";
}) {
  if (!payload?.length) {
    return null;
  }

  const theme = getChartTheme(mode);

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-3">
      {payload.map((entry) => (
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

  const description =
    displayMode === "total"
      ? t("stats.usageDescriptionTotal")
      : t("stats.usageDescriptionByUpstream");

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

  const totals = useMemo(() => {
    const totalSeries = data?.total_series ?? [];
    if (totalSeries.length > 0) {
      return totalSeries.reduce(
        (acc, point) => ({
          requests: acc.requests + point.request_count,
          tokens: acc.tokens + point.total_tokens,
        }),
        { requests: 0, tokens: 0 }
      );
    }

    if (!data?.series?.length) {
      return { requests: 0, tokens: 0 };
    }

    let requests = 0;
    let tokens = 0;

    data.series.forEach((series) => {
      series.data.forEach((point) => {
        requests += point.request_count;
        tokens += point.total_tokens;
      });
    });

    return { requests, tokens };
  }, [data]);

  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="type-title-medium text-foreground">{t("stats.usageStatistics")}</h3>
            <p className="type-body-small mt-1 text-muted-foreground">{description}</p>
          </div>

          <div className="flex gap-6">
            <div>
              <p className="type-label-medium text-muted-foreground">{t("stats.totalRequests")}</p>
              {isLoading ? (
                <UsageSummaryLoading loadingLabel={tCommon("loading")} />
              ) : (
                <p className="type-display-small text-foreground">
                  {formatNumber(totals.requests)}
                </p>
              )}
            </div>
            <div>
              <p className="type-label-medium text-muted-foreground">
                {t("stats.totalTokensUsed")}
              </p>
              {isLoading ? (
                <UsageSummaryLoading loadingLabel={tCommon("loading")} />
              ) : (
                <p className="type-display-small text-foreground">{formatNumber(totals.tokens)}</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <p className="type-label-medium text-muted-foreground">{t("stats.chartMetricLabel")}</p>
            <div className="mt-2 flex flex-wrap gap-1 rounded-cf-sm border border-divider bg-surface-200/50 p-0.5">
              {(["requests", "tokens", "cost", "ttft", "tps", "duration"] as const).map((m) => {
                const labelMap: Record<string, string> = {
                  requests: t("stats.chartTabRequests"),
                  tokens: t("stats.chartTabTokens"),
                  cost: t("stats.chartTabCost"),
                  ttft: t("stats.chartTabTtft"),
                  tps: t("stats.chartTabTps"),
                  duration: t("stats.chartTabDuration"),
                };
                return (
                  <button
                    key={m}
                    onClick={() => onMetricChange(m)}
                    className={cn(
                      "rounded-cf-sm px-3 py-1.5 type-label-medium transition-colors",
                      metric === m
                        ? "bg-amber-500/15 text-amber-500"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {labelMap[m]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="type-label-medium text-muted-foreground">
              {t("stats.chartDisplayModeLabel")}
            </p>
            <div className="mt-2 flex flex-wrap gap-1 rounded-cf-sm border border-divider bg-surface-200/50 p-0.5">
              {(
                [
                  ["total", t("stats.chartModeTotal")],
                  ["byUpstream", t("stats.chartModeByUpstream")],
                ] as const
              ).map(([modeValue, label]) => (
                <button
                  key={modeValue}
                  onClick={() => onDisplayModeChange(modeValue)}
                  className={cn(
                    "rounded-cf-sm px-3 py-1.5 type-label-medium transition-colors",
                    displayMode === modeValue
                      ? "bg-amber-500/15 text-amber-500"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="h-[280px] sm:h-[320px]">
          {isLoading ? (
            <UsageChartLoading loadingLabel={tCommon("loading")} />
          ) : chartData.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center">
              <p className="type-body-medium text-muted-foreground">{t("stats.noData")}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={theme.spacing.margin}>
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

                {seriesDefinitions.map((series) => {
                  return (
                    <Area
                      key={series.dataKey}
                      type="monotone"
                      dataKey={series.dataKey}
                      name={series.name}
                      stroke={series.color}
                      strokeWidth={2}
                      fill={`url(#${series.gradientId})`}
                      fillOpacity={1}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
