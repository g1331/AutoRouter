"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ScrollText } from "lucide-react";

import {
  DEFAULT_LOGS_SERVER_FILTERS,
  LogsTable,
  type LogsServerFilters,
} from "@/components/admin/logs-table";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { RefreshIntervalSelect } from "@/components/admin/refresh-interval-select";
import { Topbar } from "@/components/admin/topbar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalRequestLogs } from "@/hooks/use-portal-logs";
import { useRequestLogStats } from "@/hooks/use-request-log-stats";
import { normalizeRequestLogFilter, type RequestLogSort } from "@/lib/utils/request-log-filters";

export default function PortalRequestsPage() {
  const t = useTranslations("portal");
  const tCommon = useTranslations("common");
  const [page, setPage] = useState(1);
  const [refreshInterval, setRefreshInterval] = useState<number | false>(false);
  const pageSize = 20;

  const [tableFilters, setTableFilters] = useState<LogsServerFilters>(DEFAULT_LOGS_SERVER_FILTERS);
  // Functional merge: a debounced patch (e.g. the model input) can arrive after
  // a newer status/time change and must not overwrite it.
  const handleTableFiltersChange = useCallback((patch: Partial<LogsServerFilters>) => {
    setTableFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  const filter = useMemo(
    () =>
      normalizeRequestLogFilter({
        apiKeyId: tableFilters.apiKeyId,
        statusCode: tableFilters.statusCode,
        statusClass: tableFilters.statusClass,
        model: tableFilters.model,
        timeRange: tableFilters.timeRange,
        customRange: tableFilters.customRange,
        performance: tableFilters.performance,
      }),
    [tableFilters]
  );
  const sort = useMemo<RequestLogSort | undefined>(
    () =>
      tableFilters.sortField
        ? { field: tableFilters.sortField, order: tableFilters.sortOrder }
        : undefined,
    [tableFilters.sortField, tableFilters.sortOrder]
  );

  const { data, isLoading, isFetching, refetch } = usePortalRequestLogs(page, pageSize, filter, {
    refetchInterval: refreshInterval,
    sort,
  });

  const { data: windowStats } = useRequestLogStats("user", filter);

  return (
    <>
      <Topbar title={t("requests.pageTitle")} />

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <span className="type-body-medium text-muted-foreground">
              {t("requests.managementDesc")}
            </span>
          </div>
          <RefreshIntervalSelect
            onIntervalChange={setRefreshInterval}
            onManualRefresh={() => void refetch()}
            isRefreshing={isFetching}
          />
        </div>

        {isLoading ? (
          <Card
            role="status"
            aria-label={tCommon("loading")}
            variant="outlined"
            className="space-y-3 bg-card p-4"
          >
            <span className="sr-only">{tCommon("loading")}</span>
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={`portal-logs-loading-${index}`} className="h-8 w-full" />
            ))}
          </Card>
        ) : (
          <>
            <LogsTable
              logs={data?.items ?? []}
              hideRecordingSection
              serverFilters={tableFilters}
              onServerFiltersChange={handleTableFiltersChange}
              windowStats={windowStats ?? null}
            />

            {data && data.total_pages > 1 && (
              <Card variant="filled" className="border border-transparent bg-surface-400">
                <PaginationControls
                  total={data.total}
                  page={page}
                  totalPages={data.total_pages}
                  onPageChange={setPage}
                  className="p-4"
                />
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
