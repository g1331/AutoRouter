"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, BarChart3, Cpu, Key, Server, Zap } from "lucide-react";

import { Topbar } from "@/components/admin/topbar";
import {
  LeaderboardSection,
  StatsCards,
  TimeRangeSelector,
  UsageChart,
} from "@/components/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import {
  useStatsLeaderboard,
  useStatsOverview,
  useStatsTimeseries,
} from "@/hooks/use-dashboard-stats";
import { Link } from "@/i18n/navigation";
import type { TimeRange } from "@/types/api";
import type { TimeseriesMetric } from "@/hooks/use-dashboard-stats";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");

  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [metric, setMetric] = useState<TimeseriesMetric>("requests");

  const { data: overview, isLoading: overviewLoading } = useStatsOverview();
  const { data: timeseries, isLoading: timeseriesLoading } = useStatsTimeseries(timeRange, metric);
  const { data: leaderboard, isLoading: leaderboardLoading } = useStatsLeaderboard(timeRange);

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <Card variant="outlined" className="border-divider bg-surface-200/70">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-amber-500">
              <Cpu className="h-4 w-4" />
              <span className="type-label-medium">{t("controlPanel")}</span>
            </div>
            <p className="type-body-medium mt-2 text-muted-foreground">{t("controlPanelDesc")}</p>
          </CardContent>
        </Card>

        <StatsCards
          todayRequests={overview?.today_requests ?? 0}
          avgResponseTimeMs={overview?.avg_response_time_ms ?? 0}
          totalTokensToday={overview?.total_tokens_today ?? 0}
          avgTtftMs={overview?.avg_ttft_ms ?? 0}
          cacheHitRate={overview?.cache_hit_rate ?? 0}
          isLoading={overviewLoading}
        />

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-amber-500" />
              <h2 className="type-title-medium text-foreground">{t("stats.usageStatistics")}</h2>
            </div>
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          </div>

          <UsageChart
            data={timeseries}
            isLoading={timeseriesLoading}
            metric={metric}
            onMetricChange={setMetric}
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

        <Card variant="filled" className="border border-divider">
          <CardContent className="space-y-1 p-4">
            <div className="flex items-center gap-2 type-body-small text-muted-foreground">
              <span className="text-status-success">[{tCommon("sysOk").split("::")[0]}]</span>
              <span>{t("systemInitialized")}</span>
            </div>
            <div className="flex items-center gap-2 type-body-small text-muted-foreground">
              <span className="text-status-success">[{tCommon("sysOk").split("::")[0]}]</span>
              <span>{t("allServicesOnline")}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
