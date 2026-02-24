"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";

import { LogsTable } from "@/components/admin/logs-table";
import { RefreshIntervalSelect } from "@/components/admin/refresh-interval-select";
import { Topbar } from "@/components/admin/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useRequestLogs } from "@/hooks/use-request-logs";

export default function LogsPage() {
  const [page, setPage] = useState(1);
  const [refetchInterval, setRefetchInterval] = useState<number | false>(false);
  const pageSize = 20;

  const t = useTranslations("logs");
  const tCommon = useTranslations("common");

  const { data, isLoading, isFetching, refetch } = useRequestLogs(page, pageSize, undefined, {
    refetchInterval,
  });

  const handleIntervalChange = useCallback((interval: number | false) => {
    setRefetchInterval(interval);
  }, []);

  const handleManualRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <Card variant="outlined" className="border-divider bg-surface-200/70">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-amber-500">
                <ScrollText className="h-4 w-4" aria-hidden="true" />
                <span className="type-label-medium">{t("management")}</span>
              </div>
              <p className="type-body-medium text-muted-foreground">{t("managementDesc")}</p>
            </div>

            <RefreshIntervalSelect
              onIntervalChange={handleIntervalChange}
              onManualRefresh={handleManualRefresh}
              isRefreshing={isFetching}
            />
          </CardContent>
        </Card>

        {isLoading ? (
          <Card variant="outlined" className="border-divider bg-surface-200/70">
            <CardContent className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-divider border-t-amber-500" />
                <p className="type-body-small text-muted-foreground">{tCommon("loading")}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <LogsTable logs={data?.items || []} isLive={refetchInterval !== false} />

            {data && data.total_pages > 1 && (
              <Card variant="filled" className="border border-divider">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="type-body-small text-muted-foreground">
                    {tCommon("items")}{" "}
                    <span className="font-semibold text-foreground">{data.total}</span> ·{" "}
                    {tCommon("page")}{" "}
                    <span className="font-semibold text-foreground">{data.page}</span>{" "}
                    {tCommon("of")}{" "}
                    <span className="font-semibold text-foreground">{data.total_pages}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                      className="gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      {tCommon("previous")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page === data.total_pages}
                      className="gap-1"
                    >
                      {tCommon("next")}
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
