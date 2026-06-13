"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Activity, CircleDollarSign, Gauge, KeyRound } from "lucide-react";

import { Topbar } from "@/components/admin/topbar";
import { PortalUsageChart } from "@/components/portal/portal-usage-chart";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCost, formatNumber } from "@/components/dashboard/chart-theme";
import { usePortalOverview, usePortalUsage } from "@/hooks/use-portal-overview";
import type { PortalUsageRange } from "@/types/api";

interface OverviewStatCardProps {
  icon: typeof Activity;
  label: string;
  value: string;
  hint: string;
  isLoading: boolean;
}

function OverviewStatCard({ icon: Icon, label, value, hint, isLoading }: OverviewStatCardProps) {
  return (
    <Card variant="outlined" className="border-divider bg-surface-200/70">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4 text-amber-500" aria-hidden="true" />
          <span className="type-label-medium">{label}</span>
        </div>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="type-headline-small text-foreground">{value}</p>
        )}
        <p className="type-body-small text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function PortalOverviewPage() {
  const t = useTranslations("portal");
  const [range, setRange] = useState<PortalUsageRange>("7d");

  const { data: overview, isLoading: overviewLoading } = usePortalOverview();
  const { data: usage, isLoading: usageLoading } = usePortalUsage(range);

  return (
    <>
      <Topbar title={t("overview.pageTitle")} />

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewStatCard
            icon={Activity}
            label={t("overview.todayRequests")}
            value={formatNumber(overview?.today_requests ?? 0)}
            hint={t("overview.todayRequestsHint")}
            isLoading={overviewLoading}
          />
          <OverviewStatCard
            icon={Gauge}
            label={t("overview.monthRequests")}
            value={formatNumber(overview?.month_requests ?? 0)}
            hint={t("overview.totalRequestsHint", {
              total: formatNumber(overview?.total_requests ?? 0),
            })}
            isLoading={overviewLoading}
          />
          <OverviewStatCard
            icon={CircleDollarSign}
            label={t("overview.monthCost")}
            value={formatCost(overview?.month_cost_usd ?? 0)}
            hint={t("overview.totalCostHint", {
              total: formatCost(overview?.total_cost_usd ?? 0),
            })}
            isLoading={overviewLoading}
          />
          <OverviewStatCard
            icon={KeyRound}
            label={t("overview.activeKeys")}
            value={formatNumber(overview?.active_key_count ?? 0)}
            hint={t("overview.totalKeysHint", {
              total: formatNumber(overview?.total_key_count ?? 0),
            })}
            isLoading={overviewLoading}
          />
        </div>

        <PortalUsageChart
          data={usage}
          isLoading={usageLoading}
          range={range}
          onRangeChange={setRange}
        />
      </div>
    </>
  );
}
