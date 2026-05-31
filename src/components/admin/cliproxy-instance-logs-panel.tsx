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

/** 日志级别对应的色调，未识别级别使用 muted。 */
function levelClassName(level: string): string {
  switch (level.toLowerCase()) {
    case "error":
      return "text-destructive";
    case "warn":
    case "warning":
      return "text-amber-500";
    case "info":
      return "text-emerald-500";
    case "debug":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
}

/**
 * 实例日志查看面板。
 *
 * 首次显示时拉取一次日志，提供刷新按钮与前端关键词过滤。
 * 单次拉取行数受 `CLIPROXY_LOGS_DEFAULT_LIMIT` 上限，超出部分由后端控制。
 */
export function CliproxyInstanceLogsPanel({ instance }: CliproxyInstanceLogsPanelProps) {
  const t = useTranslations("cliproxy");
  const {
    data: logs,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useCliproxyInstanceLogs(instance.id);
  const [keyword, setKeyword] = useState("");

  const filtered = useMemo(() => {
    if (!logs) return [];
    const limited = logs.slice(0, CLIPROXY_LOGS_DEFAULT_LIMIT);
    if (!keyword.trim()) return limited;
    const needle = keyword.trim().toLowerCase();
    return limited.filter(
      (entry) =>
        (entry.message ?? "").toLowerCase().includes(needle) ||
        (entry.level ?? "").toLowerCase().includes(needle)
    );
  }, [logs, keyword]);

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
          <p className="py-8 text-center type-body-medium text-destructive">
            {t("logsLoadFailed")}
          </p>
        ) : !logs || logs.length === 0 ? (
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
              {filtered.map((entry, index) => (
                <li key={`${entry.timestamp}-${index}`} className="flex gap-3">
                  <span className="shrink-0 text-muted-foreground">{entry.timestamp}</span>
                  <span className={cn("shrink-0 font-semibold", levelClassName(entry.level))}>
                    [{entry.level.toUpperCase()}]
                  </span>
                  <span className="min-w-0 break-words">{entry.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
