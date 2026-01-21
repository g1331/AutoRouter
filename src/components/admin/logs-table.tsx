"use client";

import { useState, useMemo } from "react";
import { formatDistanceToNow, subDays, startOfDay } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { ScrollText, Filter } from "lucide-react";
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
import { TokenDisplay } from "@/components/admin/token-display";

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
                <TableHead>{t("tableTime")}</TableHead>
                <TableHead>{t("tableMethod")}</TableHead>
                <TableHead>{t("tablePath")}</TableHead>
                <TableHead>{t("tableModel")}</TableHead>
                <TableHead>{t("tableTokens")}</TableHead>
                <TableHead>{t("tableStatus")}</TableHead>
                <TableHead>{t("tableDuration")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow
                  key={log.id}
                  className={cn(
                    log.status_code && log.status_code >= 400 && "bg-status-error-muted/20"
                  )}
                >
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {formatDistanceToNow(new Date(log.created_at), {
                      addSuffix: true,
                      locale: dateLocale,
                    })}
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
