"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";

import { LogsTable } from "@/components/admin/logs-table";
import { RefreshIntervalSelect } from "@/components/admin/refresh-interval-select";
import { Topbar } from "@/components/admin/topbar";
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
import { useRequestLogLive } from "@/hooks/use-request-log-live";
import { useRequestLogs } from "@/hooks/use-request-logs";

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
      <Table aria-hidden="true">
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
  const { connectionState, fallbackRefetchIntervalMs } = useRequestLogLive({ enabled: true });
  const effectiveRefetchInterval =
    refetchInterval !== false ? refetchInterval : fallbackRefetchIntervalMs;

  const { data, isLoading, refetch } = useRequestLogs(page, pageSize, undefined, {
    refetchInterval: effectiveRefetchInterval,
  });

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

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <div className="mx-auto min-w-0 w-full max-w-[1560px] space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
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

        {isLoading ? (
          <div className={LOGS_SECTION_ENTER_CLASS} style={{ animationDelay: "70ms" }}>
            <LogsLoadingSkeleton loadingLabel={tCommon("loading")} />
          </div>
        ) : (
          <>
            <div className={LOGS_SECTION_ENTER_CLASS} style={{ animationDelay: "70ms" }}>
              <LogsTable
                logs={data?.items || []}
                isLive={connectionState === "live" || effectiveRefetchInterval !== false}
              />
            </div>

            {data && data.total_pages > 1 && (
              <Card
                variant="filled"
                className={cn("border border-divider", LOGS_SECTION_ENTER_CLASS)}
                style={{ animationDelay: "140ms" }}
              >
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
