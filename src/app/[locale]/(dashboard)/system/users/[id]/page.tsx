"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Activity, ArrowLeft, CircleDollarSign, Gauge, KeyRound, ScrollText } from "lucide-react";

import { Topbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { PageShell } from "@/components/admin/page-shell";
import { QueryStatus } from "@/components/ui/query-status";
import { PortalUsageChart } from "@/components/portal/portal-usage-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { formatCost, formatNumber } from "@/components/dashboard/chart-theme";
import { Link } from "@/i18n/navigation";
import {
  useAdminUser,
  useAdminUserOverview,
  useAdminUserUsage,
} from "@/hooks/use-admin-user-stats";
import { ApiError } from "@/lib/api";
import type { PortalUsageRange } from "@/types/api";

export default function AdminUserUsagePage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const t = useTranslations("users");
  const tPortal = useTranslations("portal");
  const [range, setRange] = useState<PortalUsageRange>("7d");

  const {
    data: user,
    isLoading: userLoading,
    error: userError,
    refetch: refetchUser,
  } = useAdminUser(userId);
  const userExists = !!user;
  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useAdminUserOverview(userId, userExists);
  const {
    data: usage,
    isLoading: usageLoading,
    error: usageError,
    isFetching: usageFetching,
    refetch: refetchUsage,
  } = useAdminUserUsage(userId, range, userExists);

  const notFound = userError instanceof ApiError && userError.status === 404;

  return (
    <>
      <Topbar title={t("usageDetailTitle")} />

      <PageShell maxWidth="7xl">
        <Button variant="ghost" size="sm" className="w-fit gap-2 text-muted-foreground" asChild>
          <Link href="/system/users">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("backToUsers")}
          </Link>
        </Button>
        <PageHeader
          title={user?.username ?? t("usageDetailTitle")}
          description={user?.display_name ?? undefined}
        />

        {notFound ? (
          <Card variant="outlined" className="bg-card">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <h2 className="type-title-medium text-foreground">{t("userNotFound")}</h2>
              <p className="type-body-medium text-muted-foreground">{t("userNotFoundHint")}</p>
            </CardContent>
          </Card>
        ) : userError && !user ? (
          <QueryStatus error={userError} onRetry={() => void refetchUser()} />
        ) : (
          <>
            <Card variant="outlined" className="bg-card">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                {userLoading ? (
                  <Skeleton className="h-8 w-48" />
                ) : (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={user?.role === "admin" ? "info" : "neutral"}>
                        {user?.role === "admin" ? t("roleAdmin") : t("roleMember")}
                      </Badge>
                      <Badge variant={user?.is_active ? "success" : "neutral"}>
                        {user?.is_active ? t("active") : t("inactive")}
                      </Badge>
                    </div>
                  </div>
                )}
                <Button variant="outline" size="sm" className="gap-2" asChild>
                  <Link href={{ pathname: "/logs", query: { user_id: userId } }}>
                    <ScrollText className="h-4 w-4" aria-hidden="true" />
                    {t("viewUserLogs")}
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <QueryStatus
              error={overviewError}
              hasData={Boolean(overview)}
              onRetry={() => void refetchOverview()}
            />
            {!(overviewError && !overview) && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  icon={Activity}
                  label={tPortal("overview.todayRequests")}
                  value={formatNumber(overview?.today_requests ?? 0)}
                  hint={tPortal("overview.todayRequestsHint")}
                  isLoading={overviewLoading}
                />
                <StatCard
                  icon={Gauge}
                  label={tPortal("overview.monthRequests")}
                  value={formatNumber(overview?.month_requests ?? 0)}
                  hint={tPortal("overview.totalRequestsHint", {
                    total: formatNumber(overview?.total_requests ?? 0),
                  })}
                  isLoading={overviewLoading}
                />
                <StatCard
                  icon={CircleDollarSign}
                  label={tPortal("overview.monthCost")}
                  value={formatCost(overview?.month_cost_usd ?? 0)}
                  hint={tPortal("overview.totalCostHint", {
                    total: formatCost(overview?.total_cost_usd ?? 0),
                  })}
                  isLoading={overviewLoading}
                />
                <StatCard
                  icon={KeyRound}
                  label={tPortal("overview.activeKeys")}
                  value={formatNumber(overview?.active_key_count ?? 0)}
                  hint={tPortal("overview.totalKeysHint", {
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
          </>
        )}
      </PageShell>
    </>
  );
}
