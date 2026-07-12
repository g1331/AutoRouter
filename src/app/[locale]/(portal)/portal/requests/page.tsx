"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ScrollText } from "lucide-react";

import {
  DEFAULT_LOGS_SERVER_FILTERS,
  LogsTable,
  resolvePerfPresetParams,
  type LogsServerFilters,
} from "@/components/admin/logs-table";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { RefreshIntervalSelect } from "@/components/admin/refresh-interval-select";
import { Topbar } from "@/components/admin/topbar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalRequestLogs, type PortalRequestLogsFilters } from "@/hooks/use-portal-logs";
import { useRequestLogStats, type RequestLogStatsFilters } from "@/hooks/use-request-log-stats";

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

  const filters = useMemo<PortalRequestLogsFilters>(() => {
    const statusCode = tableFilters.statusCode ? Number.parseInt(tableFilters.statusCode, 10) : NaN;
    const customRange = tableFilters.timeRange === "custom" ? tableFilters.customRange : null;
    return {
      // Exact status code wins over the class range, mirroring the backend.
      ...(Number.isFinite(statusCode)
        ? { status_code: statusCode }
        : tableFilters.statusClass !== "all"
          ? { status_class: tableFilters.statusClass }
          : {}),
      ...(tableFilters.model ? { model: tableFilters.model } : {}),
      ...resolvePerfPresetParams(tableFilters.perfPreset),
      ...(customRange
        ? { start_time: customRange.startIso, end_time: customRange.endIso }
        : { time_range: tableFilters.timeRange === "custom" ? "all" : tableFilters.timeRange }),
      ...(tableFilters.sortField
        ? { sort: tableFilters.sortField, order: tableFilters.sortOrder }
        : {}),
    };
  }, [tableFilters]);

  const { data, isLoading, isFetching, refetch } = usePortalRequestLogs(page, pageSize, filters, {
    refetchInterval: refreshInterval,
  });

  // Stats describe the window, not the page: drop sort/order so a header
  // click never refires the percentile queries.
  const statsFilters = useMemo<RequestLogStatsFilters>(() => {
    const { sort: _sort, order: _order, ...rest } = filters;
    return rest;
  }, [filters]);
  const { data: windowStats } = useRequestLogStats("user", statsFilters);

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
            className="space-y-3 border-divider bg-surface-200/70 p-4"
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
              <Card variant="filled" className="border border-divider">
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
