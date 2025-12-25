"use client";

import { formatDistanceToNow } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { ScrollText } from "lucide-react";
import type { RequestLog } from "@/types/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";

interface LogsTableProps {
  logs: RequestLog[];
}

/**
 * Cassette Futurism Request Logs Data Table
 *
 * Terminal-style data display with:
 * - Mono font for data
 * - Status code color coding
 * - Token usage display
 */
export function LogsTable({ logs }: LogsTableProps) {
  const t = useTranslations("logs");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

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

  const formatTokens = (prompt: number, completion: number, total: number) => {
    if (total === 0) {
      return <span className="text-amber-700">-</span>;
    }

    return (
      <div className="flex flex-col text-xs font-mono">
        <span className="text-amber-500">{total.toLocaleString()}</span>
        <span className="text-amber-700 text-[10px]">
          {prompt.toLocaleString()} / {completion.toLocaleString()}
        </span>
      </div>
    );
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
          {logs.map((log) => (
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
                {formatTokens(log.prompt_tokens, log.completion_tokens, log.total_tokens)}
              </TableCell>
              <TableCell>{formatStatusCode(log.status_code)}</TableCell>
              <TableCell className="font-mono text-xs">{formatDuration(log.duration_ms)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
