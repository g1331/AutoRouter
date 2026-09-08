"use client";

import { useTranslations } from "next-intl";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 查询区的真实等待／失败反馈，保留已有内容由调用方决定。 */
export function QueryStatus({
  error,
  fetching,
  hasData = false,
  onRetry,
}: {
  error?: unknown;
  fetching?: boolean;
  hasData?: boolean;
  onRetry?: () => void;
}) {
  const t = useTranslations("common");
  if (!error && !fetching) return null;
  if (!error)
    return (
      <div role="status" aria-live="off" className="relative !my-0 h-0">
        <span className="absolute right-0 top-0 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />
          {t("refreshing")}
        </span>
      </div>
    );
  return (
    <div
      role="alert"
      className="content-enter flex min-h-10 flex-wrap items-center gap-2 rounded-cf-sm border border-divider px-3 py-2 text-sm"
    >
      <AlertCircle className="h-4 w-4 shrink-0 text-status-error" aria-hidden />
      <span className="flex-1">{t(hasData ? "refreshFailed" : "loadFailed")}</span>
      {onRetry && (
        <Button variant="ghost" size="sm" disabled={fetching} onClick={onRetry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}
