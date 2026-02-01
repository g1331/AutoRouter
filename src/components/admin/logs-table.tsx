"use client";

import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { formatDistanceToNow, subDays, startOfDay } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { ScrollText, Filter, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
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
import { RoutingDecisionDisplay } from "@/components/admin/routing-decision-display";
import { StatusLed, TerminalHeader, type LedStatus } from "@/components/ui/terminal";

interface LogsTableProps {
  logs: RequestLog[];
  isLive?: boolean;
}

/**
 * Cassette Futurism Request Logs Data Table
 *
 * Terminal-style data display with:
 * - Live recording indicator [● REC]
 * - Request rate display [↓ X.X/s]
 * - LED status indicators for response codes
 * - Data scan animation for new entries
 * - Error row glow effect
 * - Terminal-style error details (├─ └─)
 * - Blinking cursor indicator
 * - Stream statistics footer
 */
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

        // Update request rate
        const now = Date.now();
        logTimestampsRef.current.push(now);
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
      return <span className="text-amber-700">-</span>;
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
        <div className="w-16 h-16 rounded-cf-sm bg-surface-300 border border-divider flex items-center justify-center mb-4">
          <ScrollText className="w-8 h-8 text-amber-700" aria-hidden="true" />
        </div>
        <h3 className="font-mono text-lg text-amber-500 mb-2">{t("noLogs")}</h3>
        <p className="font-sans text-sm text-amber-700">{t("noLogsDesc")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Terminal Header */}
      <TerminalHeader
        systemId="REQUEST_STREAM"
        isLive={isLive}
        requestRate={isLive ? requestRate : undefined}
        timeRange={timeRangeFilter.toUpperCase()}
      />

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center gap-4 p-4 border border-t-0 border-surface-400 bg-surface-200">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-amber-500" aria-hidden="true" />
          <span className="font-mono text-xs uppercase tracking-wider text-amber-700">
            {t("filters")}
          </span>
        </div>

        {/* Status Code Filter */}
        <div className="w-[180px]">
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

        {/* Model Filter */}
        <div className="w-[200px]">
          <Input
            type="text"
            placeholder={t("filterModel")}
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
          />
        </div>

        {/* Time Range Filter */}
        <div className="ml-auto">
          <TimeRangeSelector value={timeRangeFilter} onChange={setTimeRangeFilter} />
        </div>
      </div>

      {/* Empty State for Filtered Results */}
      {filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-t-0 border-surface-400">
          <div className="w-16 h-16 rounded-cf-sm bg-surface-300 border border-divider flex items-center justify-center mb-4">
            <Filter className="w-8 h-8 text-amber-700" aria-hidden="true" />
          </div>
          <h3 className="font-mono text-lg text-amber-500 mb-2">{t("noMatchingLogs")}</h3>
          <p className="font-sans text-sm text-amber-700">{t("noMatchingLogsDesc")}</p>
        </div>
      ) : (
        <>
          <div className="border border-t-0 border-surface-400 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>{t("tableTime")}</TableHead>
                  <TableHead>{t("tableUpstream")}</TableHead>
                  <TableHead>{t("tableMethod")}</TableHead>
                  <TableHead>{t("tablePath")}</TableHead>
                  <TableHead>{t("tableModel")}</TableHead>
                  <TableHead>{t("tableTokens")}</TableHead>
                  <TableHead>{t("tableStatus")}</TableHead>
                  <TableHead>{t("tableDuration")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => {
                  const isExpanded = expandedRows.has(log.id);
                  const hasFailover = log.failover_attempts > 0;
                  const hasRoutingDecision = !!log.routing_decision;
                  const canExpand = true;
                  const isNew = newLogIds.has(log.id);
                  const isError = hasErrorState(log);

                  return (
                    <Fragment key={log.id}>
                      <TableRow
                        className={cn(
                          // Error row glow effect
                          isError && "shadow-[inset_0_0_20px_-10px_var(--status-error)]",
                          // New row scan animation
                          isNew &&
                            "motion-safe:animate-[cf-data-scan_0.5s_ease-out] relative overflow-hidden",
                          canExpand && "cursor-pointer hover:bg-surface-300/50"
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
                              className="p-1 hover:bg-surface-300 rounded-cf-sm transition-colors"
                              aria-label={isExpanded ? t("collapseDetails") : t("expandDetails")}
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-amber-600" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-amber-600" />
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
                        <TableCell>
                          <RoutingDecisionDisplay
                            routingDecision={log.routing_decision}
                            upstreamName={log.upstream_name}
                            routingType={log.routing_type}
                            groupName={log.group_name}
                            failoverAttempts={log.failover_attempts}
                            compact={true}
                          />
                        </TableCell>
                        <TableCell>
                          <code className="px-1.5 py-0.5 bg-surface-300 text-amber-500 rounded-cf-sm font-mono text-xs border border-divider">
                            {log.method || "-"}
                          </code>
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[200px] truncate">
                          {log.path || <span className="text-amber-700">-</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.model || <span className="text-amber-700">-</span>}
                        </TableCell>
                        <TableCell>
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
                            <StatusLed status={getStatusLedStatus(log.status_code)} />
                            <span
                              className={cn(
                                "text-xs tabular-nums",
                                log.status_code === null && "text-amber-700",
                                log.status_code &&
                                  log.status_code >= 200 &&
                                  log.status_code < 300 &&
                                  "text-status-success",
                                log.status_code &&
                                  log.status_code >= 400 &&
                                  log.status_code < 500 &&
                                  "text-amber-500",
                                log.status_code && log.status_code >= 500 && "text-status-error"
                              )}
                            >
                              {log.status_code ?? "-"}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatDuration(log.duration_ms)}
                        </TableCell>
                      </TableRow>

                      {/* Expanded Details Row - Terminal Style */}
                      {isExpanded && canExpand && (
                        <TableRow className="bg-surface-300/30">
                          <TableCell colSpan={9} className="p-0">
                            <div className="px-4 py-3 border-t border-dashed border-divider space-y-4 font-mono text-xs">
                              {/* Two-column layout: Token Details (left) and Routing Decision (right) */}
                              <div className="grid grid-cols-2 gap-6">
                                {/* Token Details */}
                                <div>
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

                                {/* Routing Decision Details */}
                                <div>
                                  {hasRoutingDecision ? (
                                    <RoutingDecisionDisplay
                                      routingDecision={log.routing_decision}
                                      upstreamName={log.upstream_name}
                                      routingType={log.routing_type}
                                      groupName={log.group_name}
                                      failoverAttempts={log.failover_attempts}
                                      compact={false}
                                    />
                                  ) : (
                                    <div className="text-amber-700">{t("noRoutingDecision")}</div>
                                  )}
                                </div>
                              </div>

                              {/* Failover History - Terminal Style */}
                              {hasFailover && log.failover_history && (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <AlertCircle className="w-4 h-4 text-amber-600" />
                                    <span className="font-medium text-amber-700">
                                      {t("failoverDetails", { count: log.failover_attempts })}
                                    </span>
                                  </div>
                                  <div className="space-y-1 pl-2 text-amber-600">
                                    {log.failover_history.map((attempt, index) => {
                                      const isLast = index === log.failover_history!.length - 1;
                                      const prefix = isLast ? "└─" : "├─";
                                      const statusText = attempt.status_code || attempt.error_type;

                                      return (
                                        <div key={index} className="flex items-start">
                                          <span className="text-surface-500 mr-2">{prefix}</span>
                                          <span className="text-amber-500">
                                            FAILOVER: {attempt.upstream_name} →{" "}
                                            <span
                                              className={cn(
                                                attempt.error_type === "timeout" &&
                                                  "text-amber-600",
                                                attempt.error_type === "http_5xx" &&
                                                  "text-status-error",
                                                attempt.error_type === "http_429" &&
                                                  "text-orange-500"
                                              )}
                                            >
                                              [{statusText}]
                                            </span>
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

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
            <div className="border border-t-0 border-surface-400 px-4 py-2 bg-surface-200">
              <span className="cf-cursor-blink font-mono text-amber-500">_</span>
            </div>
          )}

          {/* Stream Statistics Footer */}
          <div className="border border-t-0 border-surface-400 px-4 py-2 bg-surface-300 font-mono text-xs text-amber-600">
            STREAM STATS: {streamStats.total} requests │ {streamStats.successRate}% success │ avg{" "}
            {streamStats.avgDuration.toFixed(2)}s │ {formatTokensCompact(streamStats.totalTokens)}{" "}
            tokens
          </div>
        </>
      )}
    </div>
  );
}
