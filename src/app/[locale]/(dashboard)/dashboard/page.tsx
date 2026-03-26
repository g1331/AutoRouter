"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, BarChart3, Key, Server, Zap } from "lucide-react";

import { Topbar } from "@/components/admin/topbar";
import {
  LeaderboardSection,
  StatsCards,
  TimeRangeSelector,
  UsageChart,
} from "@/components/dashboard";
import type { UsageChartDisplayMode } from "@/components/dashboard/usage-chart";
import { Card, CardContent } from "@/components/ui/card";
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

  const { data: overview, isLoading: overviewLoading } = useStatsOverview();
  const { data: timeseries, isLoading: timeseriesLoading } = useStatsTimeseries(
    timeRange,
    metric,
    customRange
  );
  const { data: leaderboard, isLoading: leaderboardLoading } = useStatsLeaderboard(
    timeRange,
    5,
    customRange
  );

  function handleTimeRangeChange(value: TimeRangeOrCustom, range?: CustomDateRange) {
    setTimeRange(value);
    setCustomRange(range);
  }

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
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

          <UsageChart
            data={timeseries}
            isLoading={timeseriesLoading}
            metric={metric}
            onMetricChange={setMetric}
            displayMode={displayMode}
            onDisplayModeChange={setDisplayMode}
          />
        </section>

        <LeaderboardSection data={leaderboard} isLoading={leaderboardLoading} />

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-amber-500">
            <Zap className="h-4 w-4" />
            <span className="type-label-medium">{t("quickActions")}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Link href="/keys" className="group block">
              <Card
                variant="outlined"
                className="border-divider transition-all hover:border-amber-500/35"
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-cf-sm border border-amber-500/35 bg-amber-500/10 text-amber-500">
                      <Key className="h-5 w-5" />
                    </div>
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
                className="border-divider transition-all hover:border-amber-500/35"
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-cf-sm border border-amber-500/35 bg-amber-500/10 text-amber-500">
                      <Server className="h-5 w-5" />
                    </div>
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
      </div>
    </>
  );
}
