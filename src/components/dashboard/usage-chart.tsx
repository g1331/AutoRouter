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
import type { StatsTimeseriesResponse } from "@/types/api";

import { formatNumber, getChartTheme, getUpstreamColor } from "./chart-theme";

interface UsageChartProps {
  data: StatsTimeseriesResponse | undefined;
  isLoading: boolean;
  timeRange?: string;
}

interface ChartDataPoint {
  timestamp: string;
  formattedTime: string;
  [key: string]: string | number;
}

function CustomTooltip({
  active,
  payload,
  label,
  mode,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  mode: "dark" | "light";
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
            {entry.name}: {formatNumber(entry.value)}
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

export function UsageChart({ data, isLoading }: UsageChartProps) {
  const t = useTranslations("dashboard");
  const { resolvedTheme } = useTheme();
  const mode = resolvedTheme === "light" ? "light" : "dark";
  const theme = getChartTheme(mode);

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

        row[series.upstream_name] = point.request_count;
      });
    });

    const sorted = Array.from(timestampMap.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return { chartData: sorted, upstreamNames: names };
  }, [data]);

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

        <div className="h-[280px] sm:h-[320px]">
          {isLoading ? (
            <div className="flex h-full w-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-2 border-amber-500/70 border-t-transparent" />
                <p className="type-body-small text-muted-foreground">{t("stats.loading")}</p>
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
                  tickFormatter={formatNumber}
                  style={{ fontFamily: theme.fonts.mono }}
                  width={theme.spacing.yAxisWidth}
                />

                <Tooltip content={<CustomTooltip mode={mode} />} />
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
