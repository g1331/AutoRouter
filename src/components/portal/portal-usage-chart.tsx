"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCost, formatNumber, getChartTheme } from "@/components/dashboard/chart-theme";
import type { PortalUsageRange, PortalUsageResponse } from "@/types/api";

type PortalUsageMetric = "requests" | "tokens" | "cost";

const METRIC_OPTIONS = ["requests", "tokens", "cost"] as const;
const RANGE_OPTIONS = ["7d", "30d"] as const;

interface PortalUsageChartProps {
  data: PortalUsageResponse | undefined;
  isLoading: boolean;
  range: PortalUsageRange;
  onRangeChange: (range: PortalUsageRange) => void;
}

function getPointValue(
  point: PortalUsageResponse["points"][number],
  metric: PortalUsageMetric
): number {
  switch (metric) {
    case "requests":
      return point.request_count;
    case "tokens":
      return point.total_tokens;
    case "cost":
      return point.total_cost_usd;
  }
}

function formatValue(value: number, metric: PortalUsageMetric): string {
  if (metric === "cost") {
    return formatCost(value);
  }
  return formatNumber(value);
}

/**
 * Day-bucketed personal usage trend for the portal overview page.
 */
export function PortalUsageChart({ data, isLoading, range, onRangeChange }: PortalUsageChartProps) {
  const t = useTranslations("portal");
  const tCommon = useTranslations("common");
  const [metric, setMetric] = useState<PortalUsageMetric>("requests");
  const { resolvedTheme } = useTheme();
  const theme = getChartTheme(resolvedTheme === "light" ? "light" : "dark");

  const chartData = useMemo(
    () =>
      (data?.points ?? []).map((point) => ({
        timestamp: point.timestamp,
        formattedTime: format(parseISO(point.timestamp), "MM/dd"),
        value: getPointValue(point, metric),
      })),
    [data, metric]
  );

  const metricLabels: Record<PortalUsageMetric, string> = {
    requests: t("overview.chartMetricRequests"),
    tokens: t("overview.chartMetricTokens"),
    cost: t("overview.chartMetricCost"),
  };

  return (
    <Card variant="outlined" className="border-divider bg-surface-200/70">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="type-title-small">{t("overview.usageTrend")}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label={t("overview.chartMetric")}
          >
            {METRIC_OPTIONS.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={metric === option ? "default" : "outline"}
                onClick={() => setMetric(option)}
              >
                {metricLabels[option]}
              </Button>
            ))}
          </div>
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label={t("overview.usageRange")}
          >
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={range === option ? "default" : "outline"}
                onClick={() => onRangeChange(option)}
              >
                {t(`overview.range_${option}`)}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : chartData.length === 0 ? (
          <div
            className={cn(
              "flex h-64 items-center justify-center",
              "type-body-medium text-muted-foreground"
            )}
          >
            {tCommon("noData")}
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="portal-usage-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme.colors.primary} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={theme.colors.primary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.grid} vertical={false} />
                <XAxis
                  dataKey="formattedTime"
                  tick={{ fill: theme.colors.text, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: theme.colors.grid }}
                />
                <YAxis
                  width={56}
                  tick={{ fill: theme.colors.text, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => formatValue(value, metric)}
                />
                <Tooltip
                  formatter={(value) => [formatValue(Number(value), metric), metricLabels[metric]]}
                  contentStyle={{
                    backgroundColor: theme.colors.tooltip.background,
                    border: `1px solid ${theme.colors.tooltip.border}`,
                    borderRadius: 8,
                    color: theme.colors.textStrong,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={theme.colors.primary}
                  strokeWidth={2}
                  fill="url(#portal-usage-gradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
