"use client";

/**
 * Usage statistics chart component.
 *
 * Displays an area chart showing request counts grouped by upstream over time.
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { chartTheme, getUpstreamColor, formatNumber } from "./chart-theme";
import type { StatsTimeseriesResponse } from "@/types/api";

interface UsageChartProps {
  data: StatsTimeseriesResponse | undefined;
  isLoading: boolean;
}

interface ChartDataPoint {
  timestamp: string;
  formattedTime: string;
  [key: string]: string | number; // Dynamic upstream keys
}

// Custom tooltip component matching Cassette Futurism style
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-surface-300 border-2 border-amber-500 rounded-cf-sm p-3 shadow-cf-glow-subtle">
      <p className="font-mono text-xs text-amber-700 mb-2">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="font-mono text-xs text-amber-500">
            {entry.name}: {formatNumber(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Custom legend component
function CustomLegend({ payload }: { payload?: Array<{ value: string; color: string }> }) {
  if (!payload?.length) return null;

  return (
    <div className="flex flex-wrap justify-center gap-4 mt-4">
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="font-mono text-xs text-amber-700">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function UsageChart({ data, isLoading }: UsageChartProps) {
  const t = useTranslations("dashboard");

  // Transform data for recharts
  const { chartData, upstreamNames } = useMemo(() => {
    if (!data?.series?.length) {
      return { chartData: [], upstreamNames: [] };
    }

    // Collect all unique timestamps and upstream names
    const timestampMap = new Map<string, ChartDataPoint>();
    const names: string[] = [];

    data.series.forEach((series) => {
      names.push(series.upstream_name);

      series.data.forEach((point) => {
        const key = point.timestamp;
        if (!timestampMap.has(key)) {
          // Format time based on granularity
          const date = parseISO(point.timestamp);
          const formattedTime =
            data.granularity === "hour" ? format(date, "HH:mm") : format(date, "MM/dd");

          timestampMap.set(key, {
            timestamp: key,
            formattedTime,
          });
        }

        const dataPoint = timestampMap.get(key)!;
        dataPoint[series.upstream_name] = point.request_count;
      });
    });

    // Sort by timestamp and convert to array
    const sorted = Array.from(timestampMap.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return { chartData: sorted, upstreamNames: names };
  }, [data]);

  // Calculate totals for the header
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
    <Card className="cf-panel">
      <CardContent className="p-6">
        {/* Header with totals */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h3 className="font-mono text-sm text-amber-500 uppercase tracking-wider">
              {t("stats.usageStatistics")}
            </h3>
            <p className="font-mono text-xs text-amber-700 mt-1">{t("stats.usageDescription")}</p>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="font-mono text-xs text-amber-700">{t("stats.totalRequests")}</p>
              {isLoading ? (
                <Skeleton variant="inline" className="w-16 h-6 mt-1" />
              ) : (
                <p className="font-display text-2xl text-amber-500">
                  {formatNumber(totals.requests)}
                </p>
              )}
            </div>
            <div>
              <p className="font-mono text-xs text-amber-700">{t("stats.totalTokensUsed")}</p>
              {isLoading ? (
                <Skeleton variant="inline" className="w-16 h-6 mt-1" />
              ) : (
                <p className="font-display text-2xl text-amber-500">
                  {formatNumber(totals.tokens)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-[300px]">
          {isLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="font-mono text-xs text-amber-700">{t("stats.loading")}</p>
              </div>
            </div>
          ) : chartData.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center">
              <p className="font-mono text-sm text-amber-700">{t("stats.noData")}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  {upstreamNames.map((name, index) => (
                    <linearGradient key={name} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={getUpstreamColor(index)} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={getUpstreamColor(index)} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={chartTheme.colors.grid}
                  vertical={false}
                />
                <XAxis
                  dataKey="formattedTime"
                  tick={{ fill: chartTheme.colors.text, fontSize: 10 }}
                  tickLine={{ stroke: chartTheme.colors.grid }}
                  axisLine={{ stroke: chartTheme.colors.grid }}
                  style={{ fontFamily: chartTheme.fonts.mono }}
                />
                <YAxis
                  tick={{ fill: chartTheme.colors.text, fontSize: 10 }}
                  tickLine={{ stroke: chartTheme.colors.grid }}
                  axisLine={{ stroke: chartTheme.colors.grid }}
                  tickFormatter={formatNumber}
                  style={{ fontFamily: chartTheme.fonts.mono }}
                  width={50}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend content={<CustomLegend />} />
                {upstreamNames.map((name, index) => (
                  <Area
                    key={name}
                    type="monotone"
                    dataKey={(point: ChartDataPoint) => point[name] as number}
                    name={name}
                    stroke={getUpstreamColor(index)}
                    strokeWidth={2}
                    fill={`url(#gradient-${index})`}
                    fillOpacity={1}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
