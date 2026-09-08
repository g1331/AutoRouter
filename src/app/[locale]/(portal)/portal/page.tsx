"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Activity, CircleDollarSign, Gauge, KeyRound } from "lucide-react";

import { Topbar } from "@/components/admin/topbar";
import { PageShell } from "@/components/admin/page-shell";
import { PageHeader } from "@/components/admin/page-header";
import { QueryStatus } from "@/components/ui/query-status";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { PortalUsageChart } from "@/components/portal/portal-usage-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import { formatCost, formatNumber } from "@/components/dashboard/chart-theme";
import { usePortalOverview, usePortalUsage } from "@/hooks/use-portal-overview";
import type { PortalUsageRange } from "@/types/api";

export default function PortalOverviewPage() {
  const t = useTranslations("portal");
  const [range, setRange] = useState<PortalUsageRange>("7d");

  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
    isFetching: overviewFetching,
    refetch: refetchOverview,
  } = usePortalOverview();
  const {
    data: usage,
    isLoading: usageLoading,
    error: usageError,
    isFetching: usageFetching,
    refetch: refetchUsage,
  } = usePortalUsage(range);

  return (
    <>
      <Topbar title={t("overview.pageTitle")} />

      <PageShell maxWidth="7xl">
        <PageHeader
          title={t("overview.pageTitle")}
          actions={
            overview?.active_key_count === 0 ? (
              <Button asChild>
                <Link href="/portal/keys">{t("nav.myKeys")}</Link>
              </Button>
            ) : undefined
          }
        />
        <QueryStatus
          error={overviewError}
          fetching={overviewFetching && !overviewLoading}
          hasData={Boolean(overview)}
          onRetry={() => void refetchOverview()}
        />
        {!(overviewError && !overview) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Activity}
              label={t("overview.todayRequests")}
              value={formatNumber(overview?.today_requests ?? 0)}
              hint={t("overview.todayRequestsHint")}
              isLoading={overviewLoading}
            />
            <StatCard
              icon={Gauge}
              label={t("overview.monthRequests")}
              value={formatNumber(overview?.month_requests ?? 0)}
              hint={t("overview.totalRequestsHint", {
                total: formatNumber(overview?.total_requests ?? 0),
              })}
              isLoading={overviewLoading}
            />
            <StatCard
              icon={CircleDollarSign}
              label={t("overview.monthCost")}
              value={formatCost(overview?.month_cost_usd ?? 0)}
              hint={t("overview.totalCostHint", {
                total: formatCost(overview?.total_cost_usd ?? 0),
              })}
              isLoading={overviewLoading}
            />
            <StatCard
              icon={KeyRound}
              label={t("overview.activeKeys")}
              value={formatNumber(overview?.active_key_count ?? 0)}
              hint={t("overview.totalKeysHint", {
                total: formatNumber(overview?.total_key_count ?? 0),
              })}
              isLoading={overviewLoading}
            />
          </div>
        )}

        <QueryStatus
          error={usageError}
          fetching={usageFetching && !usageLoading}
          hasData={Boolean(usage)}
          onRetry={() => void refetchUsage()}
        />
        {!(usageError && !usage) && (
          <PortalUsageChart
            data={usage}
            isLoading={usageLoading}
            range={range}
            onRangeChange={setRange}
          />
        )}
      </PageShell>
    </>
  );
}
