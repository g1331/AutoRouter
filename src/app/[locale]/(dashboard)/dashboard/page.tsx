"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, BarChart3, Key, Server, Zap } from "lucide-react";

import { PageShell } from "@/components/admin/page-shell";
import { PageHeader } from "@/components/admin/page-header";
import { Topbar } from "@/components/admin/topbar";
import {
  LeaderboardSection,
  RoutingTopology,
  StatsCards,
  TimeRangeSelector,
  UsageChart,
} from "@/components/dashboard";
import type { UsageChartDisplayMode } from "@/components/dashboard/usage-chart";
import { Card, CardContent } from "@/components/ui/card";
import { IconBox } from "@/components/ui/icon-box";
import { QueryStatus } from "@/components/ui/query-status";
import {
  useStatsLeaderboard,
  useStatsOverview,
  useStatsTimeseries,
  type CustomDateRange,
  type TimeseriesMetric,
} from "@/hooks/use-dashboard-stats";
import { Link } from "@/i18n/navigation";
import type { TimeRangeOrCustom } from "@/components/dashboard/time-range-selector";

export default function DashboardPage() {
  const t = useTranslations("dashboard");

  const [timeRange, setTimeRange] = useState<TimeRangeOrCustom>("7d");
  const [customRange, setCustomRange] = useState<CustomDateRange | undefined>();
  const [metric, setMetric] = useState<TimeseriesMetric>("requests");
  const [displayMode, setDisplayMode] = useState<UsageChartDisplayMode>("total");

  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useStatsOverview();
  const {
    data: timeseries,
    isLoading: timeseriesLoading,
    error: timeseriesError,
    isFetching: timeseriesFetching,
    refetch: refetchTimeseries,
  } = useStatsTimeseries(timeRange, metric, customRange);
  const {
    data: leaderboard,
    isLoading: leaderboardLoading,
    error: leaderboardError,
    refetch: refetchLeaderboard,
  } = useStatsLeaderboard(timeRange, 5, customRange);

  function handleTimeRangeChange(value: TimeRangeOrCustom, range?: CustomDateRange) {
    setTimeRange(value);
    setCustomRange(range);
  }

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <PageShell maxWidth="7xl">
        <PageHeader title={t("pageTitle")} />
        <QueryStatus
          error={overviewError}
          hasData={Boolean(overview)}
          onRetry={() => void refetchOverview()}
        />
        {!(overviewError && !overview) && (
          <StatsCards
            todayRequests={overview?.today_requests ?? 0}
            avgResponseTimeMs={overview?.avg_response_time_ms ?? 0}
            totalTokensToday={overview?.total_tokens_today ?? 0}
            totalCostToday={overview?.total_cost_today ?? 0}
            avgTtftMs={overview?.avg_ttft_ms ?? 0}
            cacheHitRate={overview?.cache_hit_rate ?? 0}
            yesterdayRequests={overview?.yesterday_requests ?? 0}
            yesterdayTotalTokens={overview?.yesterday_total_tokens ?? 0}
            yesterdayCostUsd={overview?.yesterday_cost_usd ?? 0}
            yesterdayAvgResponseTimeMs={overview?.yesterday_avg_response_time_ms ?? 0}
            yesterdayAvgTtftMs={overview?.yesterday_avg_ttft_ms ?? 0}
            yesterdayCacheHitRate={overview?.yesterday_cache_hit_rate ?? 0}
            isLoading={overviewLoading}
          />
        )}

        <RoutingTopology />

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-amber-500" />
              <h2 className="type-title-medium text-foreground">{t("stats.usageStatistics")}</h2>
            </div>
            <TimeRangeSelector
              value={timeRange}
              onChange={handleTimeRangeChange}
              customRange={customRange}
            />
          </div>

          <QueryStatus
            error={timeseriesError}
            fetching={timeseriesFetching && !timeseriesLoading}
            hasData={Boolean(timeseries)}
            onRetry={() => void refetchTimeseries()}
          />
          {!(timeseriesError && !timeseries) && (
            <UsageChart
              data={timeseries}
              isLoading={timeseriesLoading}
              metric={metric}
              onMetricChange={setMetric}
              displayMode={displayMode}
              onDisplayModeChange={setDisplayMode}
            />
          )}
        </section>

        <QueryStatus
          error={leaderboardError}
          hasData={Boolean(leaderboard)}
          onRetry={() => void refetchLeaderboard()}
        />
        {!(leaderboardError && !leaderboard) && (
          <LeaderboardSection data={leaderboard} isLoading={leaderboardLoading} />
        )}

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-amber-500">
            <Zap className="h-4 w-4" />
            <span className="type-label-medium">{t("quickActions")}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Link href="/keys" className="group block">
              <Card
                variant="outlined"
                className="transition-[color,background-color,border-color,box-shadow,opacity]"
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <IconBox size="md">
                      <Key className="h-5 w-5" />
                    </IconBox>
                    <div>
                      <p className="type-body-medium text-foreground">{t("manageApiKeys")}</p>
                      <p className="type-caption text-muted-foreground">{t("manageApiKeysDesc")}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-amber-500" />
                </CardContent>
              </Card>
            </Link>

            <Link href="/upstreams" className="group block">
              <Card
                variant="outlined"
                className="transition-[color,background-color,border-color,box-shadow,opacity]"
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <IconBox size="md">
                      <Server className="h-5 w-5" />
                    </IconBox>
                    <div>
                      <p className="type-body-medium text-foreground">{t("configureUpstreams")}</p>
                      <p className="type-caption text-muted-foreground">
                        {t("configureUpstreamsDesc")}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-amber-500" />
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>
      </PageShell>
    </>
  );
}
