"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  DatabaseZap,
  FileJson,
  Loader2,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Topbar } from "@/components/admin/topbar";
import { PaginationControls } from "@/components/admin/pagination-controls";
import {
  TimeRangeSelector,
  type TimeRangeOrCustom,
} from "@/components/dashboard/time-range-selector";
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
import { cn } from "@/lib/utils";
import {
  useCleanupTrafficRecordings,
  useDeleteTrafficRecording,
  useTrafficRecordingDetail,
  useTrafficRecordingSettings,
  useTrafficRecordings,
  useUpdateTrafficRecordingSettings,
} from "@/hooks/use-traffic-recording";
import type { CustomDateRange } from "@/hooks/use-dashboard-stats";
import type { TrafficRecordingMode, TrafficRecordingResponse } from "@/types/api";

const PAGE_SIZE = 20;

interface SettingsDraft {
  enabled: boolean;
  mode: TrafficRecordingMode;
  redactSensitive: boolean;
  retentionDays: string;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
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

function getStatusVariant(statusCode: number | null): "success" | "warning" | "error" | "neutral" {
  if (statusCode == null) return "neutral";
  if (statusCode >= 200 && statusCode < 300) return "success";
  if (statusCode >= 500) return "error";
  if (statusCode >= 400) return "warning";
  return "neutral";
}

function getTimeRangeFilters(
  value: TimeRangeOrCustom,
  customRange?: CustomDateRange
): { start_time?: string; end_time?: string } {
  const now = new Date();

  if (value === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start_time: start.toISOString() };
  }

  if (value === "7d" || value === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - (value === "7d" ? 7 : 30));
    return { start_time: start.toISOString() };
  }

  if (customRange) {
    return {
      start_time: customRange.start.toISOString(),
      end_time: customRange.end.toISOString(),
    };
  }

  return {};
}

function isJsonBranch(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

function getJsonBranchEntries(value: Record<string, unknown> | unknown[]) {
  return Array.isArray(value)
    ? value.map((entry, index) => [String(index), entry] as const)
    : Object.entries(value);
}

function getJsonBranchSummary(value: Record<string, unknown> | unknown[]) {
  const count = getJsonBranchEntries(value).length;
  return Array.isArray(value) ? `Array(${count})` : `Object(${count})`;
}

function collectExpandedJsonPaths(value: unknown, maxDepth = Number.POSITIVE_INFINITY) {
  const paths = new Set<string>();

  const visit = (currentValue: unknown, path: string, depth: number) => {
    if (!isJsonBranch(currentValue) || depth > maxDepth) {
      return;
    }

    paths.add(path);
    for (const [key, childValue] of getJsonBranchEntries(currentValue)) {
      visit(childValue, `${path}.${key}`, depth + 1);
    }
  };

  visit(value, "$", 0);
  return paths;
}

function JsonPrimitiveValue({ value }: { value: unknown }) {
  if (typeof value === "string") {
    return <span className="text-status-success">{JSON.stringify(value)}</span>;
  }

  if (typeof value === "number") {
    return <span className="text-amber-500">{value}</span>;
  }

  if (typeof value === "boolean") {
    return <span className="text-status-info">{String(value)}</span>;
  }

  if (value == null) {
    return <span className="text-muted-foreground">null</span>;
  }

  return <span className="text-muted-foreground">{JSON.stringify(value)}</span>;
}

function JsonTreeNode({
  label,
  value,
  path,
  depth,
  expandedPaths,
  onToggle,
  expandLabel,
  collapseLabel,
}: {
  label: string | null;
  value: unknown;
  path: string;
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  expandLabel: string;
  collapseLabel: string;
}) {
  const isBranch = isJsonBranch(value);

  if (!isBranch) {
    return (
      <div className="flex min-w-0 items-start gap-1.5 py-0.5">
        <span className="w-4 shrink-0" />
        {label != null ? (
          <span className="shrink-0 text-foreground">{JSON.stringify(label)}:</span>
        ) : null}
        <JsonPrimitiveValue value={value} />
      </div>
    );
  }

  const entries = getJsonBranchEntries(value);
  const isExpanded = expandedPaths.has(path);
  const branchLabel = label ?? "root";
  const openToken = Array.isArray(value) ? "[" : "{";
  const closeToken = Array.isArray(value) ? "]" : "}";

  return (
    <div className={cn(depth > 0 && "border-l border-divider/55 pl-3")}>
      <div className="flex min-w-0 items-center gap-1.5 py-0.5">
        <button
          type="button"
          onClick={() => onToggle(path)}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-cf-sm text-muted-foreground transition-colors hover:bg-surface-400 hover:text-foreground"
          aria-label={`${isExpanded ? collapseLabel : expandLabel} ${branchLabel}`}
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
        {label != null ? (
          <span className="shrink-0 text-foreground">{JSON.stringify(label)}:</span>
        ) : null}
        <span className="text-muted-foreground">{openToken}</span>
        {!isExpanded ? (
          <>
            <span className="text-muted-foreground">{getJsonBranchSummary(value)}</span>
            <span className="text-muted-foreground">{closeToken}</span>
          </>
        ) : null}
      </div>

      {isExpanded ? (
        <>
          {entries.length > 0 ? (
            <div className="ml-4">
              {entries.map(([entryLabel, entryValue]) => (
                <JsonTreeNode
                  key={`${path}.${entryLabel}`}
                  label={entryLabel}
                  value={entryValue}
                  path={`${path}.${entryLabel}`}
                  depth={depth + 1}
                  expandedPaths={expandedPaths}
                  onToggle={onToggle}
                  expandLabel={expandLabel}
                  collapseLabel={collapseLabel}
                />
              ))}
            </div>
          ) : null}
          <div className="flex min-w-0 items-center gap-1.5 py-0.5 text-muted-foreground">
            <span className="w-4 shrink-0" />
            <span>{closeToken}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function RecordingJsonBlock({ value }: { value: unknown }) {
  const tCommon = useTranslations("common");
  const jsonText = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const [expandedPaths, setExpandedPaths] = useState(() => collectExpandedJsonPaths(value, 1));
  const [copied, setCopied] = useState(false);

  const handleToggle = (path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      toast.success(tCommon("copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(tCommon("error"));
    }
  };

  return (
    <div className="overflow-hidden rounded-cf-md border border-divider bg-surface-300/80">
      <div className="flex flex-col gap-2 border-b border-divider bg-surface-300/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <FileJson className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="type-caption truncate">JSON</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setExpandedPaths(collectExpandedJsonPaths(value))}
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            {tCommon("expand")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setExpandedPaths(new Set())}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            {tCommon("collapse")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => {
              void handleCopy();
            }}
            aria-label={copied ? tCommon("copied") : tCommon("copy")}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-status-success" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? tCommon("copied") : tCommon("copy")}
          </Button>
        </div>
      </div>
      <div className="h-[28rem] overflow-auto p-3 font-mono text-[11px] leading-relaxed [overflow-anchor:none] sm:h-[34rem] xl:h-[42rem]">
        <JsonTreeNode
          label={null}
          value={value}
          path="$"
          depth={0}
          expandedPaths={expandedPaths}
          onToggle={handleToggle}
          expandLabel={tCommon("expand")}
          collapseLabel={tCommon("collapse")}
        />
      </div>
    </div>
  );
}

export default function TrafficRecordingPage() {
  const t = useTranslations("trafficRecording");
  const tCommon = useTranslations("common");
  const formatDate = useDateFormatter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("");
  const [apiKeyFilter, setApiKeyFilter] = useState("");
  const [upstreamFilter, setUpstreamFilter] = useState("");
  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRangeOrCustom>("30d");
  const [customTimeRange, setCustomTimeRange] = useState<CustomDateRange | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const settings = useTrafficRecordingSettings();
  const updateSettings = useUpdateTrafficRecordingSettings();
  const deleteRecording = useDeleteTrafficRecording();
  const cleanupRecordings = useCleanupTrafficRecordings();

  const [draft, setDraft] = useState<SettingsDraft | null>(null);

  const filters = useMemo(() => {
    const timeRangeFilters = getTimeRangeFilters(timeRangeFilter, customTimeRange);

    return {
      ...(statusFilter === "all" ? {} : { status_code: Number(statusFilter) }),
      ...(modelFilter.trim() ? { model: modelFilter.trim() } : {}),
      ...(apiKeyFilter.trim() ? { api_key_id: apiKeyFilter.trim() } : {}),
      ...(upstreamFilter.trim() ? { upstream_id: upstreamFilter.trim() } : {}),
      ...timeRangeFilters,
    };
  }, [apiKeyFilter, customTimeRange, modelFilter, statusFilter, timeRangeFilter, upstreamFilter]);

  const recordings = useTrafficRecordings(page, PAGE_SIZE, filters);
  const detail = useTrafficRecordingDetail(selectedId);
  const rows = recordings.data?.items ?? [];
  const currentSettings = settings.data;
  const baseSettings: SettingsDraft = {
    enabled: currentSettings?.enabled ?? false,
    mode: currentSettings?.mode ?? "failure",
    redactSensitive: currentSettings?.redact_sensitive ?? true,
    retentionDays: String(currentSettings?.retention_days ?? 7),
  };
  const formSettings = draft ?? baseSettings;
  const retentionDaysValue = Number(formSettings.retentionDays);
  const canSave =
    Boolean(currentSettings) &&
    Number.isInteger(retentionDaysValue) &&
    retentionDaysValue > 0 &&
    currentSettings != null &&
    (formSettings.enabled !== currentSettings.enabled ||
      formSettings.mode !== currentSettings.mode ||
      formSettings.redactSensitive !== currentSettings.redact_sensitive ||
      retentionDaysValue !== currentSettings.retention_days);

  const updateDraft = (patch: Partial<SettingsDraft>) => {
    setDraft((current) => ({ ...baseSettings, ...current, ...patch }));
  };

  const handleSave = () => {
    updateSettings.mutate({
      enabled: formSettings.enabled,
      mode: formSettings.mode,
      redact_sensitive: formSettings.redactSensitive,
      retention_days: retentionDaysValue,
    });
  };

  const handleSelect = (recording: TrafficRecordingResponse) => {
    setSelectedId((current) => (current === recording.id ? null : recording.id));
  };

  const handleTimeRangeChange = (value: TimeRangeOrCustom, range?: CustomDateRange) => {
    setTimeRangeFilter(value);
    setCustomTimeRange(range);
    setPage(1);
  };

  const handleConfirmDelete = (recordingId: string) => {
    deleteRecording.mutate(recordingId);
    setConfirmingDeleteId(null);
    setSelectedId((current) => (current === recordingId ? null : current));
  };

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <Card variant="outlined" className="border-divider bg-surface-200/70">
          <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-500">
                  <DatabaseZap className="h-4 w-4" aria-hidden="true" />
                  <span className="type-label-medium">{t("title")}</span>
                </div>
                <p className="type-body-medium max-w-3xl text-muted-foreground">
                  {t("description")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={formSettings.enabled ? "success" : "neutral"}>
                  {formSettings.enabled ? t("enabled") : t("disabled")}
                </Badge>
                <Badge variant={formSettings.redactSensitive ? "success" : "warning"}>
                  {formSettings.redactSensitive ? t("redacted") : t("notRedacted")}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1 rounded-cf-md border border-divider bg-surface-300/55 p-3">
                <p className="type-caption text-muted-foreground">{t("recordCount")}</p>
                <p className="type-title-small tabular-nums">{recordings.data?.stats.total ?? 0}</p>
              </div>
              <div className="space-y-1 rounded-cf-md border border-divider bg-surface-300/55 p-3">
                <p className="type-caption text-muted-foreground">{t("diskUsage")}</p>
                <p className="type-title-small tabular-nums">
                  {formatBytes(recordings.data?.stats.total_size_bytes ?? 0)}
                </p>
              </div>
              <div className="space-y-1 rounded-cf-md border border-divider bg-surface-300/55 p-3">
                <p className="type-caption text-muted-foreground">{t("mode")}</p>
                <p className="type-title-small">{t(`mode_${settings.data?.mode ?? "failure"}`)}</p>
              </div>
              <div className="space-y-1 rounded-cf-md border border-divider bg-surface-300/55 p-3">
                <p className="type-caption text-muted-foreground">{t("latestRecord")}</p>
                <p className="type-title-small">
                  {formatDate(recordings.data?.stats.latest_created_at ?? null)}
                </p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch
                  checked={formSettings.enabled}
                  onCheckedChange={(checked) => updateDraft({ enabled: checked })}
                />
                <span>{formSettings.enabled ? t("enabled") : t("disabled")}</span>
              </label>

              <label className="space-y-1 text-xs text-muted-foreground">
                <span>{t("mode")}</span>
                <Select
                  value={formSettings.mode}
                  onValueChange={(value) => updateDraft({ mode: value as TrafficRecordingMode })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="failure">{t("mode_failure")}</SelectItem>
                    <SelectItem value="success">{t("mode_success")}</SelectItem>
                    <SelectItem value="all">{t("mode_all")}</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch
                  checked={formSettings.redactSensitive}
                  onCheckedChange={(checked) => updateDraft({ redactSensitive: checked })}
                />
                <span>{t("redactSensitive")}</span>
              </label>

              <label className="space-y-1 text-xs text-muted-foreground">
                <span>{t("retentionDays")}</span>
                <Input
                  inputMode="numeric"
                  value={formSettings.retentionDays}
                  onChange={(event) => updateDraft({ retentionDays: event.target.value })}
                />
              </label>

              <Button onClick={handleSave} disabled={!canSave || updateSettings.isPending}>
                {updateSettings.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t("save")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card variant="outlined" className="border-divider bg-surface-200/70">
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Search className="h-4 w-4" aria-hidden="true" />
                <span className="type-caption">{t("filters")}</span>
              </div>
              <Button
                variant="outline"
                onClick={() => cleanupRecordings.mutate()}
                disabled={cleanupRecordings.isPending}
              >
                {cleanupRecordings.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {t("cleanupExpired")}
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_max-content] xl:items-center">
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger aria-label={t("statusFilter")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("statusAll")}</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="400">400</SelectItem>
                  <SelectItem value="401">401</SelectItem>
                  <SelectItem value="429">429</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={modelFilter}
                onChange={(event) => {
                  setModelFilter(event.target.value);
                  setPage(1);
                }}
                placeholder={t("modelSearchPlaceholder")}
                aria-label={t("modelSearchPlaceholder")}
              />
              <Input
                value={apiKeyFilter}
                onChange={(event) => {
                  setApiKeyFilter(event.target.value);
                  setPage(1);
                }}
                placeholder={t("apiKeyFilterPlaceholder")}
                aria-label={t("apiKeyFilterPlaceholder")}
              />
              <Input
                value={upstreamFilter}
                onChange={(event) => {
                  setUpstreamFilter(event.target.value);
                  setPage(1);
                }}
                placeholder={t("upstreamFilterPlaceholder")}
                aria-label={t("upstreamFilterPlaceholder")}
              />
              <div className="flex min-h-11 min-w-0 items-center md:col-span-2 xl:col-span-1 xl:min-w-[25rem] xl:justify-end">
                <TimeRangeSelector
                  value={timeRangeFilter}
                  customRange={customTimeRange}
                  onChange={handleTimeRangeChange}
                />
              </div>
            </div>

            {recordings.isLoading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("loading")}
              </div>
            ) : rows.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("tableTime")}</TableHead>
                    <TableHead>{t("tableStatus")}</TableHead>
                    <TableHead>{t("tableModel")}</TableHead>
                    <TableHead>{t("tablePath")}</TableHead>
                    <TableHead className="text-right">{t("tableSize")}</TableHead>
                    <TableHead>{t("tableRedaction")}</TableHead>
                    <TableHead className="text-right">{t("tableActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((recording) => (
                    <TableRow
                      key={recording.id}
                      className={cn(selectedId === recording.id && "bg-surface-300/55")}
                    >
                      <TableCell className="font-mono text-xs">
                        {formatDate(recording.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(recording.status_code)}>
                          {recording.status_code ?? recording.outcome}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[14rem] truncate font-mono text-xs">
                        {recording.model ?? "-"}
                      </TableCell>
                      <TableCell className="max-w-[18rem] truncate font-mono text-xs">
                        {recording.method ?? "-"} {recording.path ?? ""}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatBytes(recording.fixture_size_bytes)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={recording.redacted ? "success" : "warning"}>
                          {recording.redacted ? t("redacted") : t("notRedacted")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSelect(recording)}
                          >
                            <FileJson className="h-4 w-4" />
                            {selectedId === recording.id ? t("hideDetail") : t("viewDetail")}
                          </Button>
                          {confirmingDeleteId === recording.id ? (
                            <div className="inline-flex animate-in items-center gap-1.5 duration-200 fade-in-0 zoom-in-95 motion-reduce:animate-none">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setConfirmingDeleteId(null)}
                                disabled={deleteRecording.isPending}
                              >
                                {tCommon("cancel")}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleConfirmDelete(recording.id)}
                                disabled={deleteRecording.isPending}
                                className="min-w-[6.25rem]"
                              >
                                {deleteRecording.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                                {deleteRecording.isPending
                                  ? tCommon("loading")
                                  : t("deleteConfirmAction")}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setConfirmingDeleteId(recording.id)}
                              disabled={deleteRecording.isPending}
                              className="transition-[transform,opacity] duration-200 ease-cf-standard"
                            >
                              <Trash2 className="h-4 w-4" />
                              {t("delete")}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {recordings.data && recordings.data.total_pages > 1 ? (
              <PaginationControls
                total={recordings.data.total}
                page={page}
                totalPages={recordings.data.total_pages}
                onPageChange={setPage}
              />
            ) : null}
          </CardContent>
        </Card>

        {selectedId ? (
          <Card variant="outlined" className="border-divider bg-surface-200/70">
            <CardContent className="space-y-3 p-5 sm:p-6">
              <div className="flex items-center gap-2 text-amber-500">
                <FileJson className="h-4 w-4" aria-hidden="true" />
                <span className="type-label-medium">{t("detailTitle")}</span>
              </div>
              {detail.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("loadingDetail")}
                </div>
              ) : detail.isError ? (
                <p className="text-sm text-status-error">{t("detailLoadFailed")}</p>
              ) : (
                <RecordingJsonBlock key={selectedId} value={detail.data?.fixture ?? null} />
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
