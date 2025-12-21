"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Topbar } from "@/components/admin/topbar";
import { Card, CardContent } from "@/components/ui/card";
import {
  StatsCards,
  TimeRangeSelector,
  UsageChart,
  LeaderboardSection,
} from "@/components/dashboard";
import {
  useStatsOverview,
  useStatsTimeseries,
  useStatsLeaderboard,
} from "@/hooks/use-dashboard-stats";
import { Key, Server, ArrowRight, Cpu, Zap, BarChart3 } from "lucide-react";
import type { TimeRange } from "@/types/api";

/**
 * Cassette Futurism Dashboard
 *
 * System monitoring panel with:
 * - Overview statistics cards
 * - Usage chart with time range selector
 * - Leaderboard rankings
 * - Quick action links
 */
export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");

  // Time range state for charts and leaderboard
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");

  // Fetch statistics data
  const { data: overview, isLoading: overviewLoading } = useStatsOverview();
  const { data: timeseries, isLoading: timeseriesLoading } = useStatsTimeseries(timeRange);
  const { data: leaderboard, isLoading: leaderboardLoading } = useStatsLeaderboard(timeRange);

  return (
    <>
      <Topbar title={t("pageTitle")} />
      <div className="p-6 lg:p-8 max-w-7xl">
        {/* System Status Header */}
        <div className="mb-8 border-b border-dashed border-divider pb-4">
          <div className="flex items-center gap-2 font-mono text-xs text-amber-700 mb-2">
            <Cpu className="w-4 h-4" />
            <span>{t("controlPanel")}</span>
          </div>
          <p className="font-sans text-sm text-amber-500">{t("controlPanelDesc")}</p>
        </div>

        {/* Overview Stats Cards */}
        <StatsCards
          todayRequests={overview?.today_requests ?? 0}
          avgResponseTimeMs={overview?.avg_response_time_ms ?? 0}
          totalTokensToday={overview?.total_tokens_today ?? 0}
          isLoading={overviewLoading}
        />

        {/* Usage Statistics Section */}
        <div className="mt-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-500" />
              <h2 className="font-mono text-sm text-amber-500 uppercase tracking-wider">
                {t("stats.usageStatistics")}
              </h2>
            </div>
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          </div>

          <UsageChart data={timeseries} isLoading={timeseriesLoading} timeRange={timeRange} />
        </div>

        {/* Leaderboard Section */}
        <div className="mt-8">
          <LeaderboardSection data={leaderboard} isLoading={leaderboardLoading} />
        </div>

        {/* Quick Actions */}
        <div className="mt-8 space-y-4">
          <div className="flex items-center gap-2 font-mono text-xs text-amber-700">
            <Zap className="w-4 h-4" />
            <span>{t("quickActions").toUpperCase()}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Link href="/keys" className="block group">
              <Card
                variant="outlined"
                className="hover:shadow-cf-glow-subtle transition-all duration-cf-normal"
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-cf-sm bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                      <Key className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="font-mono text-sm text-amber-500">
                        {t("manageApiKeys").toUpperCase()}
                      </p>
                      <p className="font-sans text-xs text-amber-700">{t("manageApiKeysDesc")}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-amber-700 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" />
                </CardContent>
              </Card>
            </Link>

            <Link href="/upstreams" className="block group">
              <Card
                variant="outlined"
                className="hover:shadow-cf-glow-subtle transition-all duration-cf-normal"
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-cf-sm bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                      <Server className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="font-mono text-sm text-amber-500">
                        {t("configureUpstreams").toUpperCase()}
                      </p>
                      <p className="font-sans text-xs text-amber-700">
                        {t("configureUpstreamsDesc")}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-amber-700 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" />
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        {/* System Log Footer */}
        <div className="mt-8 p-4 rounded-cf-sm bg-surface-200 border border-divider font-mono text-xs">
          <div className="flex items-center gap-3 text-amber-700">
            <span className="text-status-success">[{tCommon("sysOk").split("::")[0]}]</span>
            <span>{t("systemInitialized")}</span>
          </div>
          <div className="flex items-center gap-3 text-amber-700 mt-1">
            <span className="text-status-success">[{tCommon("sysOk").split("::")[0]}]</span>
            <span>{t("allServicesOnline")}</span>
          </div>
        </div>
      </div>
    </>
  );
}
