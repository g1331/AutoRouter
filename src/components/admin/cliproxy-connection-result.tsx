"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CliproxyConnectionStatus, CliproxyConnectionTestResult } from "@/types/cliproxy";

const BADGE_VARIANT: Record<CliproxyConnectionStatus, "success" | "warning" | "secondary"> = {
  success: "success",
  auth_failed: "warning",
  unreachable: "secondary",
  service_error: "warning",
};

interface CliproxyConnectionResultProps {
  result: CliproxyConnectionTestResult;
  className?: string;
}

/**
 * 连通性检测结果展示。供实例表单的创建前预检测与已保存实例检测复用。
 */
export function CliproxyConnectionResult({ result, className }: CliproxyConnectionResultProps) {
  const t = useTranslations("cliproxy");
  const ok = result.status === "success";

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-cf-sm border p-3",
        ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5",
        className
      )}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" aria-hidden />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" aria-hidden />
      )}
      <div className="min-w-0 space-y-1">
        <Badge variant={BADGE_VARIANT[result.status]}>{t(`testStatus_${result.status}`)}</Badge>
        <p className="type-body-small break-words text-muted-foreground">{result.message}</p>
        {result.status === "unreachable" && (
          <p className="type-body-small break-words text-muted-foreground/80">
            {t("testStatus_unreachable_hint")}
          </p>
        )}
      </div>
    </div>
  );
}
