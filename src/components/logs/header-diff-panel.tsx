"use client";

import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ShieldOff, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeaderDiff {
  inbound_count: number;
  outbound_count: number;
  dropped: string[];
  auth_replaced: string | null;
  compensated: Array<{ header: string; source: string }>;
}

interface HeaderDiffPanelProps {
  headerDiff: HeaderDiff;
  className?: string;
}

export function HeaderDiffPanel({ headerDiff, className }: HeaderDiffPanelProps) {
  const t = useTranslations("logs");

  const hasDropped = headerDiff.dropped.length > 0;
  const hasCompensated = headerDiff.compensated.length > 0;
  const hasAuthReplaced = !!headerDiff.auth_replaced;

  return (
    <div className={cn("space-y-2 font-mono text-xs", className)}>
      <div className="flex items-center gap-4 text-muted-foreground">
        <span className="flex items-center gap-1">
          <ArrowDown className="w-3 h-3" />
          {t("headerDiffInbound")}:{" "}
          <span className="text-foreground ml-1">{headerDiff.inbound_count}</span>
        </span>
        <span className="text-divider">→</span>
        <span className="flex items-center gap-1">
          <ArrowUp className="w-3 h-3" />
          {t("headerDiffOutbound")}:{" "}
          <span className="text-foreground ml-1">{headerDiff.outbound_count}</span>
        </span>
      </div>

      {hasAuthReplaced && (
        <div className="flex items-center gap-1.5 text-status-warning">
          <ShieldOff className="w-3 h-3 shrink-0" />
          <span className="text-muted-foreground">{t("headerDiffAuthReplaced")}:</span>
          <code className="text-status-warning">{headerDiff.auth_replaced}</code>
        </div>
      )}

      {hasDropped && (
        <div className="space-y-0.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("headerDiffDropped")} ({headerDiff.dropped.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {headerDiff.dropped.map((h) => (
              <code
                key={h}
                className="rounded border border-divider bg-surface-300 px-1 py-0.5 text-[11px] text-muted-foreground line-through"
              >
                {h}
              </code>
            ))}
          </div>
        </div>
      )}

      {hasCompensated && (
        <div className="space-y-0.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("headerDiffCompensated")} ({headerDiff.compensated.length})
          </div>
          <div className="space-y-1">
            {headerDiff.compensated.map((c) => (
              <div key={c.header} className="flex items-center gap-2">
                <Zap className="w-3 h-3 shrink-0 text-amber-500" />
                <code className="text-amber-400">{c.header}</code>
                <span className="text-muted-foreground">←</span>
                <code className="text-muted-foreground text-[11px]">{c.source}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasDropped && !hasCompensated && !hasAuthReplaced && (
        <div className="text-muted-foreground">{t("headerDiffNoChanges")}</div>
      )}
    </div>
  );
}
