"use client";

import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { formatDistanceToNow, subDays, startOfDay } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { ScrollText, Filter, ChevronDown, ChevronUp } from "lucide-react";
import type { RequestLog, TimeRange } from "@/types/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { getDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";
import { TokenDisplay, TokenDetailContent } from "@/components/admin/token-display";
import { RoutingDecisionTimeline } from "@/components/admin/routing-decision-timeline";
import { StatusLed, TerminalHeader, type LedStatus } from "@/components/ui/terminal";

interface LogsTableProps {
  logs: RequestLog[];
  isLive?: boolean;
}

export function LogsTable({ logs, isLive = false }: LogsTableProps) {
  const t = useTranslations("logs");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  // Filter state
  const [statusCodeFilter, setStatusCodeFilter] = useState<string>("all");
  const [modelFilter, setModelFilter] = useState<string>("");
  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRange>("30d");

  // Expanded rows state for failover details
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Track new log IDs for scan animation
  const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set());
  const prevLogIdsRef = useRef<Set<string> | null>(null); // null = initial load
  const isInitialLoadRef = useRef(true);

  // Request rate calculation
  const [requestRate, setRequestRate] = useState<number>(0);
  const logTimestampsRef = useRef<number[]>([]);

  // Detect new logs and trigger animation (skip initial load)
  useEffect(() => {
    const currentIds = new Set(logs.map((log) => log.id));

    // Skip animation on initial load
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      prevLogIdsRef.current = currentIds;
      return;
    }

    const prevIds = prevLogIdsRef.current;
    if (!prevIds) {
      prevLogIdsRef.current = currentIds;
      return;
    }

    const newIds = new Set<string>();
    currentIds.forEach((id) => {
      if (!prevIds.has(id)) {
        newIds.add(id);
      }
    });

    // Always update the ref first
    prevLogIdsRef.current = currentIds;

    if (newIds.size > 0) {
      // Use queueMicrotask to defer state updates
      queueMicrotask(() => {
        setNewLogIds(newIds);

        // Update request rate (count each newly arrived log)
        const now = Date.now();
        for (let i = 0; i < newIds.size; i += 1) {
          logTimestampsRef.current.push(now);
        }
        // Keep only timestamps from last 10 seconds
        logTimestampsRef.current = logTimestampsRef.current.filter((ts) => now - ts < 10000);
        setRequestRate(logTimestampsRef.current.length / 10);
      });

      // Clear animation after it completes
      const clearTimer = setTimeout(() => {
        setNewLogIds(new Set());
      }, 500);

      return () => {
        clearTimeout(clearTimer);
      };
    }
  }, [logs]);

  const toggleRow = (logId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedRows(newExpanded);
  };

  // Filter logs based on criteria
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Status code filter
      if (statusCodeFilter !== "all") {
        if (
          statusCodeFilter === "2xx" &&
          (log.status_code === null || log.status_code < 200 || log.status_code >= 300)
        ) {
          return false;
        }
        if (
          statusCodeFilter === "4xx" &&
          (log.status_code === null || log.status_code < 400 || log.status_code >= 500)
        ) {
          return false;
        }
        if (
          statusCodeFilter === "5xx" &&
          (log.status_code === null || log.status_code < 500 || log.status_code >= 600)
        ) {
          return false;
        }
      }

      // Model filter (case-insensitive partial match)
      if (
        modelFilter &&
        log.model &&
        !log.model.toLowerCase().includes(modelFilter.toLowerCase())
      ) {
        return false;
      }

      // Time range filter
      const logDate = new Date(log.created_at);
      const now = new Date();

      if (timeRangeFilter === "today") {
        const todayStart = startOfDay(now);
        if (logDate < todayStart) {
          return false;
        }
      } else if (timeRangeFilter === "7d") {
        const sevenDaysAgo = subDays(now, 7);
        if (logDate < sevenDaysAgo) {
          return false;
        }
      } else if (timeRangeFilter === "30d") {
        const thirtyDaysAgo = subDays(now, 30);
        if (logDate < thirtyDaysAgo) {
          return false;
        }
      }

      return true;
    });
  }, [logs, statusCodeFilter, modelFilter, timeRangeFilter]);

  // Calculate stream statistics
  const streamStats = useMemo(() => {
    if (filteredLogs.length === 0) {
      return { total: 0, successRate: 0, avgDuration: 0, totalTokens: 0 };
    }

    const successCount = filteredLogs.filter(
      (log) => log.status_code && log.status_code >= 200 && log.status_code < 300
    ).length;

    const durations = filteredLogs
      .filter((log) => log.duration_ms !== null)
      .map((log) => log.duration_ms!);

    const avgDuration =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    const totalTokens = filteredLogs.reduce((sum, log) => sum + (log.total_tokens || 0), 0);

    return {
      total: filteredLogs.length,
      successRate: Math.round((successCount / filteredLogs.length) * 100),
      avgDuration: avgDuration / 1000, // Convert to seconds
      totalTokens,
    };
  }, [filteredLogs]);

  const getStatusLedStatus = (statusCode: number | null): LedStatus => {
    if (statusCode === null) return "degraded";
    if (statusCode >= 200 && statusCode < 300) return "healthy";
    if (statusCode >= 400 && statusCode < 500) return "degraded";
    return "offline"; // 5xx
  };

  const formatDuration = (durationMs: number | null) => {
    if (durationMs === null) {
      return <span className="text-muted-foreground">-</span>;
    }

    if (durationMs < 1000) {
      return `${durationMs}ms`;
    }

    return `${(durationMs / 1000).toFixed(2)}s`;
  };

  const formatTokensCompact = (total: number | null) => {
    if (total === null || total === 0) return "-";
    if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
    return String(total);
  };

  // Check if row has error state
  const hasErrorState = (log: RequestLog): boolean => {
    return log.status_code !== null && log.status_code >= 400;
  };

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-cf-md border border-divider bg-surface-300/80">
          <ScrollText className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 className="type-title-medium mb-2 text-foreground">{t("noLogs")}</h3>
        <p className="type-body-medium text-muted-foreground">{t("noLogsDesc")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-cf-md border border-divider bg-surface-200/70">
      {/* Terminal Header */}
      <TerminalHeader
        systemId="REQUEST_STREAM"
        isLive={isLive}
        requestRate={isLive ? requestRate : undefined}
        timeRange={timeRangeFilter.toUpperCase()}
        className="border-0 border-b border-divider bg-transparent"
      />

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center gap-3 border-b border-divider bg-surface-200 p-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="type-caption text-muted-foreground">{t("filters")}</span>
        </div>

        <div className="w-full sm:w-[180px]">
          <Select value={statusCodeFilter} onValueChange={setStatusCodeFilter}>
            <SelectTrigger>
              <SelectValue placeholder={t("filterStatus")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterStatusAll")}</SelectItem>
              <SelectItem value="2xx">{t("filterStatus2xx")}</SelectItem>
              <SelectItem value="4xx">{t("filterStatus4xx")}</SelectItem>
              <SelectItem value="5xx">{t("filterStatus5xx")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-[220px]">
          <Input
            type="text"
            placeholder={t("filterModel")}
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
          />
        </div>

        <div className="w-full sm:ml-auto sm:w-auto">
          <TimeRangeSelector value={timeRangeFilter} onChange={setTimeRangeFilter} />
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-cf-md border border-divider bg-surface-300/80">
            <Filter className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="type-title-medium mb-2 text-foreground">{t("noMatchingLogs")}</h3>
          <p className="type-body-medium text-muted-foreground">{t("noMatchingLogsDesc")}</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden">
            <Table frame="none">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>{t("tableTime")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("tableUpstream")}</TableHead>
                  <TableHead>{t("tableMethod")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("tablePath")}</TableHead>
                  <TableHead className="hidden xl:table-cell">{t("tableModel")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("tableTokens")}</TableHead>
                  <TableHead>{t("tableStatus")}</TableHead>
                  <TableHead>{t("tableDuration")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("tableTtft")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => {
                  const isExpanded = expandedRows.has(log.id);
                  const hasFailover = log.failover_attempts > 0;
                  const hasRoutingDecision = !!log.routing_decision;
                  // Token details moved from tooltip into the expanded row, so allow expansion
                  // whenever there is something meaningful to show.
                  // - In-progress requests: tokens may be 0 but routing_decision can exist
                  // - Normal requests: routing_decision may be null but token stats usually exist
                  const canExpand = hasFailover || hasRoutingDecision || log.total_tokens > 0;
                  const isNew = newLogIds.has(log.id);
                  const isError = hasErrorState(log);
                  const upstreamDisplayName =
                    log.upstream_id === null ? null : (log.upstream_name ?? t("upstreamUnknown"));
                  const firstFailoverAttemptAt =
                    log.failover_history && log.failover_history.length > 0
                      ? log.failover_history[0]?.attempted_at
                      : null;
                  const requestStartMs = new Date(log.created_at).getTime();
                  const requestEndMs =
                    log.duration_ms !== null && !Number.isNaN(requestStartMs)
                      ? requestStartMs + log.duration_ms
                      : NaN;
                  const firstFailoverMs = firstFailoverAttemptAt
                    ? new Date(firstFailoverAttemptAt).getTime()
                    : NaN;

                  let failoverDurationMs: number | null = null;
                  if (hasFailover) {
                    if (!Number.isNaN(firstFailoverMs) && !Number.isNaN(requestEndMs)) {
                      failoverDurationMs = Math.max(0, requestEndMs - firstFailoverMs);
                    } else if (!Number.isNaN(firstFailoverMs) && !Number.isNaN(requestStartMs)) {
                      failoverDurationMs = Math.max(0, requestStartMs - firstFailoverMs);
                    } else if (log.duration_ms !== null) {
                      failoverDurationMs = log.duration_ms;
                    }
                  }

                  return (
                    <Fragment key={log.id}>
                      <TableRow
                        className={cn(
                          // Error row accent (subtle left border, no glow)
                          isError && "border-l-2 border-l-status-error/45",
                          // New row subtle highlight
                          isNew && "bg-status-info-muted/25",
                          canExpand &&
                            (isError
                              ? "cursor-pointer hover:bg-status-error-muted/15"
                              : "cursor-pointer hover:bg-surface-300/50")
                        )}
                        onClick={() => canExpand && toggleRow(log.id)}
                      >
                        <TableCell className="p-2">
                          {canExpand && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRow(log.id);
                              }}
                              className="rounded-cf-sm p-1 transition-colors hover:bg-surface-300"
                              aria-label={isExpanded ? t("collapseDetails") : t("expandDetails")}
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              )}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {formatDistanceToNow(new Date(log.created_at), {
                            addSuffix: true,
                            locale: dateLocale,
                          })}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <RoutingDecisionTimeline
                            routingDecision={log.routing_decision}
                            upstreamName={upstreamDisplayName}
                            routingType={log.routing_type}
                            groupName={log.group_name}
                            failoverAttempts={log.failover_attempts}
                            sessionId={log.session_id}
                            affinityHit={log.affinity_hit}
                            affinityMigrated={log.affinity_migrated}
                            compact={true}
                          />
                        </TableCell>
                        <TableCell>
                          <code className="rounded-cf-sm border border-divider bg-surface-300 px-1.5 py-0.5 font-mono text-xs text-foreground">
                            {log.method || "-"}
                          </code>
                        </TableCell>
                        <TableCell className="hidden max-w-[200px] truncate font-mono text-xs lg:table-cell">
                          {log.path || <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="hidden font-mono text-xs xl:table-cell">
                          {log.model || <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <TokenDisplay
                            promptTokens={log.prompt_tokens}
                            completionTokens={log.completion_tokens}
                            totalTokens={log.total_tokens}
                            cachedTokens={log.cached_tokens}
                            reasoningTokens={log.reasoning_tokens}
                            cacheCreationTokens={log.cache_creation_tokens}
                            cacheReadTokens={log.cache_read_tokens}
                          />
                        </TableCell>
                        <TableCell>
                          {/* LED Status Indicator */}
                          <span className="inline-flex items-center gap-1.5 font-mono">
                            <StatusLed
                              status={getStatusLedStatus(log.status_code)}
                              className="w-14 shrink-0 justify-center"
                            />
                            <span
                              className={cn(
                                "text-xs tabular-nums",
                                log.status_code === null && "text-muted-foreground",
                                log.status_code &&
                                  log.status_code >= 200 &&
                                  log.status_code < 300 &&
                                  "text-status-success",
                                log.status_code &&
                                  log.status_code >= 400 &&
                                  log.status_code < 500 &&
                                  "text-status-warning",
                                log.status_code && log.status_code >= 500 && "text-status-error"
                              )}
                            >
                              {log.status_code ?? "-"}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <div>
                            {formatDuration(log.duration_ms)}
                            {log.is_stream &&
                              log.duration_ms != null &&
                              log.completion_tokens > 0 &&
                              log.routing_duration_ms != null &&
                              log.ttft_ms != null &&
                              (() => {
                                const genTime =
                                  log.duration_ms! - log.routing_duration_ms! - log.ttft_ms!;
                                if (genTime <= 0) return null;
                                const tps =
                                  Math.round((log.completion_tokens / genTime) * 1000 * 10) / 10;
                                return (
                                  <span className="block text-xs text-muted-foreground">
                                    {tps} tok/s
                                  </span>
                                );
                              })()}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell font-mono text-xs">
                          {log.ttft_ms != null ? (
                            `${log.ttft_ms}ms`
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Expanded Details Row - Terminal Style */}
                      {isExpanded && canExpand && (
                        <TableRow className="bg-surface-300/30">
                          <TableCell colSpan={9} className="p-0">
                            <div className="px-4 py-3 border-t border-dashed border-divider space-y-4 font-mono text-xs">
                              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-6">
                                <div className="min-w-0 xl:shrink-0">
                                  <RoutingDecisionTimeline
                                    routingDecision={log.routing_decision}
                                    upstreamName={upstreamDisplayName}
                                    routingType={log.routing_type}
                                    groupName={log.group_name}
                                    failoverAttempts={log.failover_attempts}
                                    failoverHistory={log.failover_history}
                                    failoverDurationMs={failoverDurationMs}
                                    routingDurationMs={log.routing_duration_ms}
                                    durationMs={log.duration_ms}
                                    statusCode={log.status_code}
                                    cachedTokens={log.cached_tokens}
                                    cacheReadTokens={log.cache_read_tokens}
                                    sessionId={log.session_id}
                                    affinityHit={log.affinity_hit}
                                    affinityMigrated={log.affinity_migrated}
                                    compact={false}
                                  />
                                </div>

                                <div className="w-full xl:w-[340px] xl:shrink-0">
                                  <TokenDetailContent
                                    promptTokens={log.prompt_tokens}
                                    completionTokens={log.completion_tokens}
                                    totalTokens={log.total_tokens}
                                    cachedTokens={log.cached_tokens}
                                    reasoningTokens={log.reasoning_tokens}
                                    cacheCreationTokens={log.cache_creation_tokens}
                                    cacheReadTokens={log.cache_read_tokens}
                                  />
                                </div>
                              </div>

                              {/* Error Details - Terminal Style */}
                              {isError && (
                                <div className="text-status-error">
                                  <span className="text-surface-500">├─</span> ERROR_TYPE: HTTP_
                                  {log.status_code}
                                  <br />
                                  <span className="text-surface-500">└─</span> STATUS:{" "}
                                  {log.status_code && log.status_code >= 500
                                    ? "SERVER_ERROR"
                                    : "CLIENT_ERROR"}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Blinking Cursor Indicator (Live Mode) */}
          {isLive && (
            <div className="border-t border-divider bg-surface-200 px-4 py-2">
              <span className="inline-flex items-center gap-2 rounded-[6px] border border-status-success/35 bg-status-success-muted px-2 py-0.5 font-mono text-xs text-status-success">
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-current"
                  aria-hidden="true"
                />
                LIVE
              </span>
            </div>
          )}

          <div className="border-t border-divider bg-surface-300 px-4 py-2 type-body-small text-muted-foreground">
            STREAM STATS: {streamStats.total} requests | {streamStats.successRate}% success | avg{" "}
            {streamStats.avgDuration.toFixed(2)}s | {formatTokensCompact(streamStats.totalTokens)}{" "}
            tokens
          </div>
        </>
      )}
    </div>
  );
}
