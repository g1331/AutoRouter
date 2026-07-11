import { Wallet } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { useBackgroundSyncTasks } from "@/hooks/use-background-sync";
import type { useBillingOverview, useSyncBillingPrices } from "@/hooks/use-billing";

import {
  getBillingTaskStatusLabel,
  getSyncBadgeVariant,
  type BillingTranslate,
} from "./billing-format";

export function BillingSummaryCards({
  t,
  locale,
  usd,
  overview,
  backgroundTasks,
  syncPrices,
}: {
  t: BillingTranslate;
  locale: string;
  usd: Intl.NumberFormat;
  overview: ReturnType<typeof useBillingOverview>;
  backgroundTasks: ReturnType<typeof useBackgroundSyncTasks>;
  syncPrices: ReturnType<typeof useSyncBillingPrices>;
}) {
  const latestSync = overview.data?.latest_sync ?? null;
  const priceSyncTask =
    backgroundTasks.data?.items.find((task) => task.task_name === "billing_price_catalog_sync") ??
    null;
  const legacyLatestSyncText = latestSync
    ? latestSync.status === "success"
      ? t("syncSuccess", { source: latestSync.source ?? "-" })
      : latestSync.status === "partial"
        ? t("syncPartial", { source: latestSync.source ?? "-" })
        : t("syncFailed")
    : t("syncNever");
  const latestSyncText = getBillingTaskStatusLabel(
    t,
    priceSyncTask?.last_status ?? null,
    legacyLatestSyncText
  );
  const latestSyncFailureReason = priceSyncTask?.last_error ?? latestSync?.failure_reason ?? null;

  return (
    <>
      <PageHeader
        icon={Wallet}
        title={t("management")}
        description={t("managementDesc")}
        actions={
          <Button onClick={() => syncPrices.mutate()} disabled={syncPrices.isPending}>
            {syncPrices.isPending ? t("syncing") : t("syncNow")}
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card variant="filled" className="border border-divider">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("todayCost")}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {usd.format(overview.data?.today_cost_usd ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card variant="filled" className="border border-divider">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("monthCost")}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {usd.format(overview.data?.month_cost_usd ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card variant="filled" className="border border-divider">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("unresolvedModels")}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {overview.data?.unresolved_model_count ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card variant="filled" className="border border-divider">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("latestSync")}</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge
                variant={getSyncBadgeVariant(
                  priceSyncTask?.last_status ?? latestSync?.status ?? null
                )}
              >
                {latestSyncText}
              </Badge>
            </div>
            {priceSyncTask?.next_run_at && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("syncNextRun", {
                  time: new Date(priceSyncTask.next_run_at).toLocaleString(locale),
                })}
              </p>
            )}
            {latestSyncFailureReason && (
              <p className="mt-2 text-xs text-status-warning">
                {t("syncFailureReason", { reason: latestSyncFailureReason })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
