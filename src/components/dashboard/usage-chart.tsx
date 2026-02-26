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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { StatsTimeseriesResponse } from "@/types/api";
import type { TimeseriesMetric } from "@/hooks/use-dashboard-stats";

import { formatNumber, getChartTheme, getUpstreamColor } from "./chart-theme";

interface UsageChartProps {
  data: StatsTimeseriesResponse | undefined;
  isLoading: boolean;
  timeRange?: string;
  metric: TimeseriesMetric;
  onMetricChange: (metric: TimeseriesMetric) => void;
}

interface ChartDataPoint {
  timestamp: string;
  formattedTime: string;
  [key: string]: string | number;
}

function formatTtft(ttftMs: number): string {
  if (ttftMs >= 1000) {
    return `${(ttftMs / 1000).toFixed(3)}s`;
  }
  return `${Math.round(ttftMs)}ms`;
}

function formatMetricValue(value: number, metric: TimeseriesMetric): string {
  if (metric === "ttft") {
    return formatTtft(value);
  }
  if (metric === "tps") {
    return `${formatNumber(value)} tok/s`;
  }
  return formatNumber(value);
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
      className="min-w-[180px] rounded-cf-sm border p-3 shadow-[var(--vr-shadow-sm)]"
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

export function UsageChart({ data, isLoading, metric, onMetricChange }: UsageChartProps) {
  const t = useTranslations("dashboard");
  const { resolvedTheme } = useTheme();
  const mode = resolvedTheme === "light" ? "light" : "dark";
  const theme = getChartTheme(mode);

  const valueKey: string =
    metric === "ttft" ? "avg_ttft_ms" : metric === "tps" ? "avg_tps" : "request_count";

  const { chartData, upstreamNames } = useMemo(() => {
    if (!data?.series?.length) {
      return { chartData: [] as ChartDataPoint[], upstreamNames: [] as string[] };
    }

    const timestampMap = new Map<string, ChartDataPoint>();
    const names: string[] = [];

    data.series.forEach((series) => {
      names.push(series.upstream_name);

      series.data.forEach((point) => {
        const key = point.timestamp;
        if (!timestampMap.has(key)) {
          const date = parseISO(point.timestamp);
          const formattedTime =
            data.granularity === "hour" ? format(date, "HH:mm") : format(date, "MM/dd");

          timestampMap.set(key, {
            timestamp: key,
            formattedTime,
          });
        }

        const row = timestampMap.get(key);
        if (!row) {
          return;
        }

        row[series.upstream_name] =
          ((point as unknown as Record<string, unknown>)[valueKey] as number) ?? 0;
      });
    });

    const sorted = Array.from(timestampMap.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return { chartData: sorted, upstreamNames: names };
  }, [data, valueKey]);

  const totals = useMemo(() => {
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
            <p className="type-body-small mt-1 text-muted-foreground">
              {t("stats.usageDescription")}
            </p>
          </div>

          <div className="flex gap-6">
            <div>
              <p className="type-label-medium text-muted-foreground">{t("stats.totalRequests")}</p>
              {isLoading ? (
                <Skeleton variant="inline" className="mt-1 h-6 w-16" />
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
                <Skeleton variant="inline" className="mt-1 h-6 w-16" />
              ) : (
                <p className="type-display-small text-foreground">{formatNumber(totals.tokens)}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-1 rounded-cf-sm border border-divider bg-surface-200/50 p-0.5">
          {(["requests", "ttft", "tps"] as const).map((m) => (
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
              {t(`stats.chartTab${m === "requests" ? "Requests" : m === "ttft" ? "Ttft" : "Tps"}`)}
            </button>
          ))}
        </div>

        <div className="h-[280px] sm:h-[320px]">
          {isLoading ? (
            <div
              data-testid="usage-chart-loading-skeleton"
              className="flex h-full w-full flex-col gap-4 rounded-cf-sm border border-divider/75 bg-surface-300/35 p-3"
            >
              <div className="grid grid-cols-3 gap-2">
                <div className="h-4 animate-pulse rounded-cf-sm bg-surface-400/70" />
                <div className="h-4 animate-pulse rounded-cf-sm bg-surface-400/70" />
                <div className="h-4 animate-pulse rounded-cf-sm bg-surface-400/70" />
              </div>

              <div className="grid flex-1 grid-cols-8 items-end gap-2">
                <div className="h-[35%] animate-pulse rounded-cf-sm bg-surface-400/70" />
                <div className="h-[52%] animate-pulse rounded-cf-sm bg-surface-400/70" />
                <div className="h-[44%] animate-pulse rounded-cf-sm bg-surface-400/70" />
                <div className="h-[68%] animate-pulse rounded-cf-sm bg-surface-400/70" />
                <div className="h-[58%] animate-pulse rounded-cf-sm bg-surface-400/70" />
                <div className="h-[76%] animate-pulse rounded-cf-sm bg-surface-400/70" />
                <div className="h-[63%] animate-pulse rounded-cf-sm bg-surface-400/70" />
                <div className="h-[81%] animate-pulse rounded-cf-sm bg-surface-400/70" />
              </div>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center">
              <p className="type-body-medium text-muted-foreground">{t("stats.noData")}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={theme.spacing.margin}>
                <defs>
                  {upstreamNames.map((name, index) => {
                    const color = getUpstreamColor(index, mode);
                    return (
                      <linearGradient
                        key={name}
                        id={`usage-gradient-${name}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={color} stopOpacity={theme.area.opacityStart} />
                        <stop offset="95%" stopColor={color} stopOpacity={theme.area.opacityEnd} />
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
                  tickFormatter={(v: number) =>
                    metric === "ttft"
                      ? formatTtft(v)
                      : metric === "tps"
                        ? `${formatNumber(v)}`
                        : formatNumber(v)
                  }
                  style={{ fontFamily: theme.fonts.mono }}
                  width={theme.spacing.yAxisWidth}
                />

                <Tooltip content={<CustomTooltip mode={mode} metric={metric} />} />
                <Legend content={<CustomLegend mode={mode} />} />

                {upstreamNames.map((name, index) => {
                  const color = getUpstreamColor(index, mode);
                  return (
                    <Area
                      key={name}
                      type="monotone"
                      dataKey={(point: ChartDataPoint) => point[name] as number}
                      name={name}
                      stroke={color}
                      strokeWidth={2}
                      fill={`url(#usage-gradient-${name})`}
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
