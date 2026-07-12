"use client";

import { useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ScrollText, X } from "lucide-react";

import {
  DEFAULT_LOGS_SERVER_FILTERS,
  LogsTable,
  resolvePerfPresetParams,
  type LogsFilterOption,
  type LogsServerFilters,
} from "@/components/admin/logs-table";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { RefreshIntervalSelect } from "@/components/admin/refresh-interval-select";
import { Topbar } from "@/components/admin/topbar";
import { Link, usePathname } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useAPIKeys } from "@/hooks/use-api-keys";
import { useRequestLogLive } from "@/hooks/use-request-log-live";
import { useRequestLogStats, type RequestLogStatsFilters } from "@/hooks/use-request-log-stats";
import { useRequestLogs, type RequestLogsFilters } from "@/hooks/use-request-logs";
import { useAllUpstreams } from "@/hooks/use-upstreams";

interface LogsLoadingSkeletonProps {
  loadingLabel: string;
}

const LOGS_SECTION_ENTER_CLASS = "animate-log-section-enter motion-reduce:animate-none";

function LogsLoadingSkeleton({ loadingLabel }: LogsLoadingSkeletonProps) {
  return (
    <Card
      role="status"
      aria-label={loadingLabel}
      variant="outlined"
      className="border-divider bg-surface-200/70 overflow-hidden"
    >
      <span className="sr-only">{loadingLabel}</span>
      <Table
        aria-hidden="true"
        frame="none"
        containerClassName="rounded-none border-0 bg-transparent"
      >
        <TableHeader>
          <TableRow>
            <TableHead className="w-9 px-1.5"></TableHead>
            <TableHead className="w-[148px] px-1.5">
              <Skeleton className="h-3 w-12" />
            </TableHead>
            <TableHead className="hidden lg:table-cell w-[120px] px-1.5">
              <Skeleton className="h-3 w-16" />
            </TableHead>
            <TableHead className="w-[60px] px-1.5">
              <Skeleton className="h-3 w-8" />
            </TableHead>
            <TableHead className="hidden lg:table-cell w-[60px] px-1.5">
              <Skeleton className="h-3 w-12" />
            </TableHead>
            <TableHead className="hidden xl:table-cell w-[272px] px-1.5 pl-1">
              <Skeleton className="h-3 w-12" />
            </TableHead>
            <TableHead className="hidden md:table-cell w-[140px] px-1.5">
              <Skeleton className="h-3 w-12" />
            </TableHead>
            <TableHead className="w-[100px] px-1.5 text-right">
              <Skeleton className="h-3 w-12 ml-auto" />
            </TableHead>
            <TableHead className="w-[68px] px-1.5">
              <Skeleton className="h-3 w-12" />
            </TableHead>
            <TableHead className="w-[148px] px-1.5">
              <Skeleton className="h-3 w-12" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 10 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell className="px-1.5 py-1.5">
                <Skeleton className="h-2 w-4" />
              </TableCell>
              <TableCell className="w-[148px] font-mono text-[10px] whitespace-nowrap px-1.5 py-1.5">
                <Skeleton className="h-2 w-24" />
              </TableCell>
              <TableCell className="hidden lg:table-cell w-[120px] px-1.5 py-1.5 min-w-0 overflow-hidden text-[10px]">
                <Skeleton className="h-2 w-full max-w-[80px]" />
              </TableCell>
              <TableCell className="w-[60px] px-1.5 py-1">
                <Skeleton className="h-2 w-8" />
              </TableCell>
              <TableCell className="hidden text-[10px] lg:table-cell w-[60px] px-1.5 py-1 pr-1 min-w-0">
                <Skeleton className="h-2 w-10" />
              </TableCell>
              <TableCell className="hidden font-mono text-[10px] xl:table-cell w-[272px] px-1.5 py-1 pl-1 min-w-0">
                <Skeleton className="h-2 w-24" />
              </TableCell>
              <TableCell className="hidden md:table-cell w-[140px] px-1.5 py-1 min-w-0 overflow-hidden text-[10px]">
                <Skeleton className="h-2 w-16" />
              </TableCell>
              <TableCell className="w-[100px] px-1.5 py-1 text-right">
                <Skeleton className="h-2 w-10 ml-auto" />
              </TableCell>
              <TableCell className="w-[68px] px-1.5 py-1">
                <Skeleton className="h-2 w-10" />
              </TableCell>
              <TableCell className="w-[148px] px-1.5 py-1 font-mono text-[10px] leading-tight">
                <Skeleton className="h-2 w-full max-w-[60px]" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export default function LogsPage() {
  const [page, setPage] = useState(1);
  const [refetchInterval, setRefetchInterval] = useState<number | false>(false);
  const [isManualRefreshPending, setIsManualRefreshPending] = useState(false);
  const pageSize = 20;

  const t = useTranslations("logs");
  const tCommon = useTranslations("common");
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const focusId = searchParams.get("focus")?.trim() || null;
  const userId = focusId ? null : searchParams.get("user_id")?.trim() || null;

  const { connectionState, fallbackRefetchIntervalMs } = useRequestLogLive({
    enabled: focusId === null,
  });
  const effectiveRefetchInterval =
    refetchInterval !== false ? refetchInterval : fallbackRefetchIntervalMs;

  const [tableFilters, setTableFilters] = useState<LogsServerFilters>(DEFAULT_LOGS_SERVER_FILTERS);
  // Functional merge: a debounced patch (e.g. the model input) can arrive after
  // a newer status/time change and must not overwrite it.
  const handleTableFiltersChange = useCallback((patch: Partial<LogsServerFilters>) => {
    setTableFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  // Filter-select options; admin-only endpoints, so the portal never receives
  // these props. Keys are capped at the first 100 — acceptable for a selector.
  const { data: allUpstreams } = useAllUpstreams();
  const { data: apiKeysData } = useAPIKeys(1, 100);
  const upstreamFilterOptions = useMemo<LogsFilterOption[]>(
    () => (allUpstreams ?? []).map((upstream) => ({ id: upstream.id, name: upstream.name })),
    [allUpstreams]
  );
  const apiKeyFilterOptions = useMemo<LogsFilterOption[]>(
    () => (apiKeysData?.items ?? []).map((key) => ({ id: key.id, name: key.name })),
    [apiKeysData]
  );

  const filters = useMemo<RequestLogsFilters>(() => {
    if (focusId) return { id: focusId };
    const statusCode = tableFilters.statusCode ? Number.parseInt(tableFilters.statusCode, 10) : NaN;
    const customRange = tableFilters.timeRange === "custom" ? tableFilters.customRange : null;
    return {
      ...(userId ? { user_id: userId } : {}),
      ...(tableFilters.upstreamId ? { upstream_id: tableFilters.upstreamId } : {}),
      ...(tableFilters.apiKeyId ? { api_key_id: tableFilters.apiKeyId } : {}),
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
  }, [focusId, userId, tableFilters]);
  // Stats describe the window, not the page: drop sort/order so a header
  // click never refires the percentile queries.
  const statsFilters = useMemo<RequestLogStatsFilters>(() => {
    const { id: _id, sort: _sort, order: _order, ...rest } = filters;
    return rest;
  }, [filters]);
  const { data: windowStats } = useRequestLogStats("admin", statsFilters, {
    enabled: !focusId,
  });
  const focusInitialExpanded = useMemo(() => (focusId ? [focusId] : []), [focusId]);
  const { data, isLoading, refetch } = useRequestLogs(
    focusId ? 1 : page,
    focusId ? 1 : pageSize,
    filters,
    {
      refetchInterval: focusId ? false : effectiveRefetchInterval,
    }
  );

  const handleIntervalChange = useCallback((interval: number | false) => {
    setRefetchInterval(interval);
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setIsManualRefreshPending(true);
    try {
      await refetch();
    } finally {
      setIsManualRefreshPending(false);
    }
  }, [refetch]);

  const liveStatusMotionClass =
    connectionState === "live"
      ? "animate-log-badge-live motion-reduce:animate-none"
      : connectionState === "connecting"
        ? "animate-log-badge-connect motion-reduce:animate-none"
        : "";

  const focusedItems = data?.items ?? [];
  const focusNotFound = focusId !== null && !isLoading && focusedItems.length === 0;

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <div className="mx-auto min-w-0 w-full max-w-[1560px] space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        {focusId ? (
          <Card
            variant="outlined"
            className={cn(
              "border-divider bg-surface-200/70",
              LOGS_SECTION_ENTER_CLASS,
              focusNotFound && "border-status-warning/40"
            )}
          >
            <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="type-caption text-muted-foreground">
                  {focusNotFound ? t("focusNotFound") : t("focusActive")}
                </p>
                <p className="type-body-medium truncate font-mono text-xs">{focusId}</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={pathname}>
                  <X className="h-4 w-4" />
                  {t("focusClear")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {userId && (
              <Card
                variant="outlined"
                className={cn(
                  "border-divider bg-surface-200/70 border-amber-500/40",
                  LOGS_SECTION_ENTER_CLASS
                )}
              >
                <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="type-caption text-muted-foreground">{t("userFilterActive")}</p>
                    <p className="type-body-medium truncate font-mono text-xs">{userId}</p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={pathname}>
                      <X className="h-4 w-4" />
                      {t("userFilterClear")}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
            <Card
              variant="outlined"
              className={cn("border-divider bg-surface-200/70", LOGS_SECTION_ENTER_CLASS)}
            >
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-500">
                    <ScrollText className="h-4 w-4" aria-hidden="true" />
                    <span className="type-label-medium">{t("management")}</span>
                  </div>
                  <p className="type-body-medium text-muted-foreground">{t("managementDesc")}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                    <Badge
                      variant={
                        connectionState === "live"
                          ? "success"
                          : connectionState === "connecting"
                            ? "info"
                            : "warning"
                      }
                      className={cn("px-2 py-0.5 text-[10px] leading-none", liveStatusMotionClass)}
                    >
                      {connectionState === "live"
                        ? t("liveStatusLive")
                        : connectionState === "connecting"
                          ? t("liveStatusConnecting")
                          : t("liveStatusFallback")}
                    </Badge>
                    <span>
                      {connectionState === "fallback"
                        ? t("liveStatusFallbackDesc")
                        : t("liveStatusLiveDesc")}
                    </span>
                  </div>
                </div>

                <RefreshIntervalSelect
                  onIntervalChange={handleIntervalChange}
                  onManualRefresh={handleManualRefresh}
                  isRefreshing={isManualRefreshPending}
                />
              </CardContent>
            </Card>
          </>
        )}

        {isLoading ? (
          <div className={LOGS_SECTION_ENTER_CLASS} style={{ animationDelay: "70ms" }}>
            <LogsLoadingSkeleton loadingLabel={tCommon("loading")} />
          </div>
        ) : (
          <>
            <div className={LOGS_SECTION_ENTER_CLASS} style={{ animationDelay: "70ms" }}>
              <LogsTable
                logs={focusedItems}
                isLive={
                  focusId === null &&
                  (connectionState === "live" || effectiveRefetchInterval !== false)
                }
                initialExpandedIds={focusInitialExpanded}
                serverFilters={focusId ? undefined : tableFilters}
                onServerFiltersChange={focusId ? undefined : handleTableFiltersChange}
                upstreamFilterOptions={focusId ? undefined : upstreamFilterOptions}
                apiKeyFilterOptions={focusId ? undefined : apiKeyFilterOptions}
                windowStats={focusId ? undefined : (windowStats ?? null)}
              />
            </div>

            {!focusId && data && data.total_pages > 1 && (
              <Card
                variant="filled"
                className={cn("border border-divider", LOGS_SECTION_ENTER_CLASS)}
                style={{ animationDelay: "140ms" }}
              >
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
