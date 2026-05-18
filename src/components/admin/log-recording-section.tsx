"use client";

import { useLocale, useTranslations } from "next-intl";
import { DatabaseZap, ExternalLink, FileWarning, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RecordingJsonBlock } from "@/components/admin/recording-json-block";
import { useTrafficRecordingByLogId } from "@/hooks/use-traffic-recording";

interface LogRecordingSectionProps {
  logId: string;
  enabled: boolean;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

export function LogRecordingSection({ logId, enabled }: LogRecordingSectionProps) {
  const t = useTranslations("trafficRecording");
  const locale = useLocale();
  const result = useTrafficRecordingByLogId(logId, enabled);

  const formatDate = (value: string | null) => {
    if (!value) return "-";
    return new Intl.DateTimeFormat(locale, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  };

  return (
    <div className="rounded-cf-md border border-divider bg-surface-200/70">
      <div className="flex flex-col gap-2 border-b border-divider px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-amber-500">
          <DatabaseZap className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="type-label-medium">{t("logSectionTitle")}</span>
        </div>
        {result.status === "present" && result.summary ? (
          <Button asChild variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs">
            <Link href="/system/traffic-recording">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              {t("logSectionOpenRecordings")}
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="p-3">
        {result.status === "idle" ? (
          <p className="type-caption text-muted-foreground">{t("logSectionIdle")}</p>
        ) : null}

        {result.status === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{t("logSectionLoading")}</span>
          </div>
        ) : null}

        {result.status === "absent" ? (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>{t("logSectionAbsent")}</span>
            <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
              <Link href="/system/traffic-recording">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {t("logSectionOpenRecordingSettings")}
              </Link>
            </Button>
          </div>
        ) : null}

        {result.status === "missing-file" ? (
          <div className="flex flex-col gap-2 text-sm text-status-warning sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <FileWarning className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t("logSectionMissingFile")}</span>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
              <Link href="/system/traffic-recording">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {t("logSectionOpenRecordings")}
              </Link>
            </Button>
          </div>
        ) : null}

        {result.status === "error" && result.error ? (
          <p className="text-sm text-status-error">
            {t("logSectionLoadFailed", { message: result.error.message ?? "" })}
          </p>
        ) : null}

        {result.status === "present" && result.summary && result.detail ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge
                variant={
                  result.summary.status_code != null && result.summary.status_code >= 500
                    ? "error"
                    : result.summary.status_code != null && result.summary.status_code >= 400
                      ? "warning"
                      : result.summary.status_code != null && result.summary.status_code >= 200
                        ? "success"
                        : "neutral"
                }
              >
                {result.summary.status_code ?? result.summary.outcome}
              </Badge>
              {result.summary.model ? (
                <span className="font-mono">{result.summary.model}</span>
              ) : null}
              <span>{formatBytes(result.summary.fixture_size_bytes)}</span>
              <Badge variant={result.summary.redacted ? "success" : "warning"}>
                {result.summary.redacted ? t("redacted") : t("notRedacted")}
              </Badge>
              <span className="font-mono">{formatDate(result.summary.created_at)}</span>
            </div>

            <RecordingJsonBlock value={result.detail.fixture ?? null} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
