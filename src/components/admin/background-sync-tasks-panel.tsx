"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Check, CheckCircle2, Clock3, Loader2, Play, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useBackgroundSyncTasks,
  useRunBackgroundSyncTask,
  useUpdateBackgroundSyncTask,
} from "@/hooks/use-background-sync";
import type { BackgroundSyncTaskLastStatus, BackgroundSyncTaskResponse } from "@/types/api";

type IntervalUnit = "second" | "minute" | "hour" | "day";

const INTERVAL_SECONDS_BY_UNIT: Record<IntervalUnit, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
};

const INTERVAL_UNITS: IntervalUnit[] = ["day", "hour", "minute", "second"];

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
    <Badge variant={getStatusVariant(status)} className="gap-1 whitespace-nowrap">
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

function getTaskTitle(task: BackgroundSyncTaskResponse, t: ReturnType<typeof useTranslations>) {
  if (task.task_name === "billing_price_catalog_sync") {
    return t("taskBillingPriceCatalogSync");
  }
  if (task.task_name === "upstream_model_catalog_sync") {
    return t("taskUpstreamModelCatalogSync");
  }
  return task.display_name;
}

function getTaskDescription(
  task: BackgroundSyncTaskResponse,
  t: ReturnType<typeof useTranslations>
) {
  if (task.task_name === "billing_price_catalog_sync") {
    return t("taskBillingPriceCatalogSyncDesc");
  }
  if (task.task_name === "upstream_model_catalog_sync") {
    return t("taskUpstreamModelCatalogSyncDesc");
  }
  return task.task_name;
}

function getIntervalDraft(intervalSeconds: number): { amount: string; unit: IntervalUnit } {
  for (const unit of INTERVAL_UNITS) {
    const unitSeconds = INTERVAL_SECONDS_BY_UNIT[unit];
    if (intervalSeconds >= unitSeconds && intervalSeconds % unitSeconds === 0) {
      return { amount: String(intervalSeconds / unitSeconds), unit };
    }
  }
  return { amount: String(intervalSeconds), unit: "second" };
}

function formatIntervalSeconds(
  intervalSeconds: number,
  t: ReturnType<typeof useTranslations>
): string {
  const draft = getIntervalDraft(intervalSeconds);
  return t(`intervalDisplay_${draft.unit}`, { count: Number(draft.amount) });
}

function TaskConfigControls({ task }: { task: BackgroundSyncTaskResponse }) {
  const t = useTranslations("backgroundSync");
  const updateTask = useUpdateBackgroundSyncTask();
  const initialIntervalDraft = getIntervalDraft(task.interval_seconds);
  const [enabled, setEnabled] = useState(task.enabled);
  const [intervalAmount, setIntervalAmount] = useState(initialIntervalDraft.amount);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(initialIntervalDraft.unit);

  const intervalAmountValue = Number(intervalAmount);
  const intervalValue = intervalAmountValue * INTERVAL_SECONDS_BY_UNIT[intervalUnit];
  const canSave =
    Number.isInteger(intervalAmountValue) &&
    intervalAmountValue > 0 &&
    intervalValue >= 60 &&
    (enabled !== task.enabled || intervalValue !== task.interval_seconds);

  return (
    <div className="flex min-w-[17.5rem] flex-wrap items-center gap-2 sm:flex-nowrap">
      <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={updateTask.isPending}
          aria-label={t("enabled")}
        />
        <span>{enabled ? t("enabled") : t("disabled")}</span>
      </label>
      <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span>{t("intervalShort")}</span>
        <Input
          className="h-8 w-14 text-xs tabular-nums"
          inputMode="numeric"
          value={intervalAmount}
          onChange={(event) => setIntervalAmount(event.target.value)}
          disabled={updateTask.isPending}
        />
      </label>
      <Select
        value={intervalUnit}
        onValueChange={(value) => setIntervalUnit(value as IntervalUnit)}
        disabled={updateTask.isPending}
      >
        <SelectTrigger className="h-8 w-[4.5rem] px-2 text-xs" aria-label={t("intervalUnit")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="day">{t("intervalUnitDay")}</SelectItem>
          <SelectItem value="hour">{t("intervalUnitHour")}</SelectItem>
          <SelectItem value="minute">{t("intervalUnitMinute")}</SelectItem>
          <SelectItem value="second">{t("intervalUnitSecond")}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="secondary"
        className="h-8 w-8 shrink-0 px-0"
        title={t("saveConfig")}
        aria-label={t("saveConfig")}
        disabled={!canSave || updateTask.isPending}
        onClick={() =>
          updateTask.mutate({
            taskName: task.task_name,
            data: { enabled, interval_seconds: intervalValue },
          })
        }
      >
        <Check className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function BackgroundSyncTasksPanel() {
  const t = useTranslations("backgroundSync");
  const tasks = useBackgroundSyncTasks();
  const runTask = useRunBackgroundSyncTask();
  const formatDate = useDateFormatter();
  const rows = tasks.data?.items ?? [];
  const getTitle = (task: BackgroundSyncTaskResponse) => getTaskTitle(task, t);
  const getDescription = (task: BackgroundSyncTaskResponse) => getTaskDescription(task, t);

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
        </div>

        <div className="hidden md:block">
          <Table className="min-w-[1182px] table-fixed" containerClassName="rounded-cf-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[260px]">{t("task")}</TableHead>
                <TableHead className="w-[320px]">{t("config")}</TableHead>
                <TableHead className="w-[90px]">{t("state")}</TableHead>
                <TableHead className="w-[100px]">{t("lastFinished")}</TableHead>
                <TableHead className="w-[100px]">{t("nextRun")}</TableHead>
                <TableHead className="w-[160px]">{t("result")}</TableHead>
                <TableHead className="w-[152px] text-center">{t("action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((task) => (
                <TableRow key={task.task_name}>
                  <TableCell className="py-4">
                    <div className="min-w-0 space-y-1.5" title={task.task_name}>
                      <p className="truncate text-sm font-medium leading-5 text-foreground">
                        {getTitle(task)}
                      </p>
                      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {getDescription(task)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <TaskConfigControls
                      key={`${task.task_name}:${task.enabled}:${task.interval_seconds}`}
                      task={task}
                    />
                  </TableCell>
                  <TableCell className="py-4">
                    <TaskStatusBadge status={task.last_status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-4 tabular-nums">
                    {formatDate(task.last_finished_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-4 tabular-nums">
                    {formatDate(task.next_run_at)}
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="space-y-1">
                      <TaskMetrics task={task} />
                      {task.last_error && (
                        <p className="max-w-md truncate text-xs text-status-warning">
                          {task.last_error}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-4 text-center">
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-w-[6.75rem] whitespace-nowrap"
                      disabled={runTask.isPending || task.is_running}
                      onClick={() => runTask.mutate(task.task_name)}
                    >
                      <Play className="h-4 w-4 shrink-0" />
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
                <div className="min-w-0 space-y-1.5">
                  <p className="text-sm font-medium leading-5 text-foreground">{getTitle(task)}</p>
                  <p className="text-xs leading-5 text-muted-foreground">{getDescription(task)}</p>
                </div>
                <TaskStatusBadge status={task.last_status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>{t("config")}</span>
                <span className="text-right text-foreground">
                  {task.enabled ? t("enabled") : t("disabled")} /{" "}
                  {formatIntervalSeconds(task.interval_seconds, t)}
                </span>
                <span>{t("lastFinished")}</span>
                <span className="text-right text-foreground">
                  {formatDate(task.last_finished_at)}
                </span>
                <span>{t("nextRun")}</span>
                <span className="text-right text-foreground">{formatDate(task.next_run_at)}</span>
              </div>
              <div className="mt-3">
                <TaskConfigControls
                  key={`${task.task_name}:${task.enabled}:${task.interval_seconds}`}
                  task={task}
                />
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
