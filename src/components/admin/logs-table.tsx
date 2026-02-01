"use client";

import { useState, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
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

interface LogsTableProps {
  logs: RequestLog[];
}

/**
 * Cassette Futurism Request Logs Data Table
 *
 * Terminal-style data display with:
 * - Mono font for data
 * - Status code color coding
 * - Token usage display with tooltip details
 * - Filter controls for status code, model, and time range
 */
export function LogsTable({ logs }: LogsTableProps) {
  const t = useTranslations("logs");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  // Filter state
  const [statusCodeFilter, setStatusCodeFilter] = useState<string>("all");
  const [modelFilter, setModelFilter] = useState<string>("");
  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRange>("30d");

  // Expanded rows state for failover details
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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

  const formatStatusCode = (statusCode: number | null) => {
    if (statusCode === null) {
      return <span className="text-amber-700">-</span>;
    }

    const isSuccess = statusCode >= 200 && statusCode < 300;
    const isClientError = statusCode >= 400 && statusCode < 500;
    const isServerError = statusCode >= 500;

    return (
      <Badge
        variant={
          isSuccess ? "success" : isClientError ? "warning" : isServerError ? "error" : "default"
        }
      >
        {statusCode}
      </Badge>
    );
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

  const formatErrorType = (errorType: string) => {
    const errorColors: Record<string, string> = {
      timeout: "text-amber-600",
      http_5xx: "text-red-600",
      http_429: "text-orange-600",
      connection_error: "text-amber-700",
    };
    return errorColors[errorType] || "text-amber-700";
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
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-cf-sm border border-divider bg-surface-200">
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
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-cf-sm bg-surface-300 border border-divider flex items-center justify-center mb-4">
            <Filter className="w-8 h-8 text-amber-700" aria-hidden="true" />
          </div>
          <h3 className="font-mono text-lg text-amber-500 mb-2">{t("noMatchingLogs")}</h3>
          <p className="font-sans text-sm text-amber-700">{t("noMatchingLogsDesc")}</p>
        </div>
      ) : (
        <div className="rounded-cf-sm border border-divider overflow-hidden">
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

                return (
                  <>
                    <TableRow
                      key={log.id}
                      className={cn(
                        log.status_code && log.status_code >= 400 && "bg-status-error-muted/20",
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
                      <TableCell>{formatStatusCode(log.status_code)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatDuration(log.duration_ms)}
                      </TableCell>
                    </TableRow>

                    {/* Expanded Details Row - Token Details, Routing Decision, and Failover History */}
                    {isExpanded && canExpand && (
                      <TableRow className="bg-surface-300/30">
                        <TableCell colSpan={9} className="p-0">
                          <div className="px-4 py-3 border-t border-dashed border-divider space-y-4">
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
                                  <div className="text-xs text-amber-700">
                                    {t("noRoutingDecision")}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Failover History */}
                            {hasFailover && log.failover_history && (
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <AlertCircle className="w-4 h-4 text-amber-600" />
                                  <span className="font-mono text-xs font-medium text-amber-700">
                                    {t("failoverDetails", { count: log.failover_attempts })}
                                  </span>
                                </div>
                                <div className="space-y-2 pl-6">
                                  {log.failover_history.map((attempt, index) => (
                                    <div
                                      key={index}
                                      className="flex items-start gap-3 text-xs font-mono"
                                    >
                                      <span className="text-amber-600">#{index + 1}</span>
                                      <div className="flex-1 grid grid-cols-4 gap-4">
                                        <div>
                                          <span className="text-amber-700">{t("upstream")}: </span>
                                          <span className="text-amber-500">
                                            {attempt.upstream_name}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-amber-700">{t("errorType")}: </span>
                                          <span className={formatErrorType(attempt.error_type)}>
                                            {attempt.error_type}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-amber-700">
                                            {t("statusCode")}:{" "}
                                          </span>
                                          <span className="text-amber-500">
                                            {attempt.status_code || "-"}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-amber-700">{t("time")}: </span>
                                          <span className="text-amber-500">
                                            {new Date(attempt.attempted_at).toLocaleTimeString()}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="col-span-4 text-amber-600 max-w-md truncate">
                                        {attempt.error_message}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
