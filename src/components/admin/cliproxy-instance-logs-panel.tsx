"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CLIPROXY_LOGS_DEFAULT_LIMIT, useCliproxyInstanceLogs } from "@/hooks/use-cliproxy";
import { cn } from "@/lib/utils";
import type { CliproxyInstance } from "@/types/cliproxy";

interface CliproxyInstanceLogsPanelProps {
  instance: CliproxyInstance;
}

/** 启发式识别行内日志级别用于上色；未识别时落到 muted 色。 */
function classifyLineLevel(line: string): string {
  const normalized = line.toUpperCase();
  if (/\b(ERROR|ERR|FATAL|PANIC)\b/.test(normalized)) return "text-destructive";
  if (/\b(WARN|WARNING)\b/.test(normalized)) return "text-status-warning";
  if (/\b(INFO|NOTICE)\b/.test(normalized)) return "text-status-success";
  if (/\b(DEBUG|TRACE)\b/.test(normalized)) return "text-muted-foreground";
  return "text-foreground";
}

/**
 * 实例日志查看面板。
 *
 * 首次显示时拉取一次 CLIProxyAPI 上 `LoggingToFile` 输出的最近 N 行原始日志，
 * 提供刷新按钮与前端关键词过滤。上游若未启用 `LoggingToFile` 会返回 400，
 * 经管理 API 客户端透传后展示具体错误原因。
 */
export function CliproxyInstanceLogsPanel({ instance }: CliproxyInstanceLogsPanelProps) {
  const t = useTranslations("cliproxy");
  const {
    data: result,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useCliproxyInstanceLogs(instance.id, { limit: CLIPROXY_LOGS_DEFAULT_LIMIT });
  const [keyword, setKeyword] = useState("");

  const errorMessage = error instanceof Error ? error.message : null;

  const filtered = useMemo(() => {
    const lines = result?.lines ?? [];
    if (!keyword.trim()) return lines;
    const needle = keyword.trim().toLowerCase();
    return lines.filter((line) => line.toLowerCase().includes(needle));
  }, [result, keyword]);

  return (
    <Card variant="outlined">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="type-title-medium text-foreground">{t("logsTitle")}</h2>
            <p className="type-body-small text-muted-foreground">{instance.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t("logsSearchPlaceholder")}
              className="w-64"
            />
            <Button variant="outline" disabled={isFetching} onClick={() => refetch()}>
              <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} />
              {t("logsRefresh")}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : isError ? (
          <div className="space-y-2 py-8 text-center">
            <p className="type-body-medium text-destructive">{t("logsLoadFailed")}</p>
            {errorMessage ? (
              <p className="break-words type-body-small text-muted-foreground">{errorMessage}</p>
            ) : null}
          </div>
        ) : !result || result.lines.length === 0 ? (
          <p className="py-8 text-center type-body-medium text-muted-foreground">
            {t("logsEmpty")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center type-body-medium text-muted-foreground">
            {t("logsNoMatches")}
          </p>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto rounded-cf-sm border border-border bg-surface-200 p-3 font-mono">
            <ul className="space-y-1 type-body-small">
              {filtered.map((line, index) => (
                <li
                  key={`${index}-${line.slice(0, 32)}`}
                  className={cn("break-words", classifyLineLevel(line))}
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
