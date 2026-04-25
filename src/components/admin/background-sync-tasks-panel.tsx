"use client";

import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Play, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBackgroundSyncTasks, useRunBackgroundSyncTask } from "@/hooks/use-background-sync";
import type { BackgroundSyncTaskLastStatus, BackgroundSyncTaskResponse } from "@/types/api";

function getStatusVariant(
  status: BackgroundSyncTaskLastStatus | null
): "success" | "warning" | "error" | "neutral" {
  if (status === "success") return "success";
  if (status === "failed") return "error";
  if (status === "partial" || status === "running" || status === "skipped") return "warning";
  return "neutral";
}

function formatDuration(durationMs: number | null): string {
  if (durationMs == null) return "-";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function useDateFormatter() {
  const locale = useLocale();
  return (value: string | null) => {
    if (!value) return "-";
    return new Intl.DateTimeFormat(locale, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  };
}

function StatusIcon({ status }: { status: BackgroundSyncTaskLastStatus | null }) {
  if (status === "success") return <CheckCircle2 className="h-3 w-3" />;
  if (status === "failed" || status === "partial") return <AlertTriangle className="h-3 w-3" />;
  if (status === "running") return <Loader2 className="h-3 w-3 animate-spin" />;
  return <Clock3 className="h-3 w-3" />;
}

function TaskStatusBadge({ status }: { status: BackgroundSyncTaskLastStatus | null }) {
  const t = useTranslations("backgroundSync");
  return (
    <Badge variant={getStatusVariant(status)} className="gap-1">
      <StatusIcon status={status} />
      {t(`status_${status ?? "never"}`)}
    </Badge>
  );
}

function TaskMetrics({ task }: { task: BackgroundSyncTaskResponse }) {
  const t = useTranslations("backgroundSync");
  return (
    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
      <span>{t("successCount", { count: task.last_success_count })}</span>
      <span>{t("failureCount", { count: task.last_failure_count })}</span>
      <span>{t("duration", { duration: formatDuration(task.last_duration_ms) })}</span>
    </div>
  );
}

export function BackgroundSyncTasksPanel() {
  const t = useTranslations("backgroundSync");
  const tasks = useBackgroundSyncTasks();
  const runTask = useRunBackgroundSyncTask();
  const formatDate = useDateFormatter();
  const rows = tasks.data?.items ?? [];

  if (tasks.isLoading) {
    return (
      <Card variant="outlined" className="border-divider bg-surface-200/70">
        <CardContent className="p-5 text-sm text-muted-foreground">{t("loading")}</CardContent>
      </Card>
    );
  }

  if (tasks.isError) {
    return (
      <Card variant="outlined" className="border-divider bg-surface-200/70">
        <CardContent className="space-y-3 p-5">
          <p className="text-sm text-status-error">{t("loadFailed")}</p>
          <Button variant="outline" size="sm" onClick={() => void tasks.refetch()}>
            <RefreshCw className="h-4 w-4" />
            {t("refresh")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="outlined" className="border-divider bg-surface-200/70">
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-500">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span className="type-label-medium">{t("panelTitle")}</span>
            </div>
            <p className="text-sm text-muted-foreground">{t("panelDescription")}</p>
          </div>
          <Badge variant={tasks.data?.background_sync_enabled ? "success" : "neutral"}>
            {tasks.data?.background_sync_enabled ? t("globalEnabled") : t("globalDisabled")}
          </Badge>
        </div>

        <div className="hidden overflow-hidden rounded-cf-sm border border-divider md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("task")}</TableHead>
                <TableHead>{t("state")}</TableHead>
                <TableHead>{t("lastFinished")}</TableHead>
                <TableHead>{t("nextRun")}</TableHead>
                <TableHead>{t("result")}</TableHead>
                <TableHead className="text-right">{t("action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((task) => (
                <TableRow key={task.task_name}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{task.display_name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{task.task_name}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <TaskStatusBadge status={task.last_status} />
                  </TableCell>
                  <TableCell>{formatDate(task.last_finished_at)}</TableCell>
                  <TableCell>{formatDate(task.next_run_at)}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <TaskMetrics task={task} />
                      {task.last_error && (
                        <p className="max-w-md truncate text-xs text-status-warning">
                          {task.last_error}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={runTask.isPending || task.is_running}
                      onClick={() => runTask.mutate(task.task_name)}
                    >
                      <Play className="h-4 w-4" />
                      {task.is_running ? t("running") : t("runNow")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3 md:hidden">
          {rows.map((task) => (
            <div key={task.task_name} className="rounded-cf-sm border border-divider p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-foreground">{task.display_name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {task.task_name}
                  </p>
                </div>
                <TaskStatusBadge status={task.last_status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>{t("lastFinished")}</span>
                <span className="text-right text-foreground">
                  {formatDate(task.last_finished_at)}
                </span>
                <span>{t("nextRun")}</span>
                <span className="text-right text-foreground">{formatDate(task.next_run_at)}</span>
              </div>
              <div className="mt-3">
                <TaskMetrics task={task} />
                {task.last_error && (
                  <p className="mt-2 text-xs text-status-warning">{task.last_error}</p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                disabled={runTask.isPending || task.is_running}
                onClick={() => runTask.mutate(task.task_name)}
              >
                <Play className="h-4 w-4" />
                {task.is_running ? t("running") : t("runNow")}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
