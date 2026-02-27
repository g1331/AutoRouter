"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface HeaderDiff {
  inbound_count: number;
  outbound_count: number;
  dropped: string[];
  auth_replaced: string | null;
  compensated: Array<{ header: string; source: string; value: string }>;
}

interface HeaderDiffPanelProps {
  headerDiff: HeaderDiff;
  className?: string;
}

export function HeaderDiffPanel({ headerDiff, className }: HeaderDiffPanelProps) {
  const t = useTranslations("logs");

  const delta = headerDiff.outbound_count - headerDiff.inbound_count;
  const deltaLabel = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "±0";
  const deltaClass =
    delta > 0 ? "text-status-success" : delta < 0 ? "text-status-error" : "text-muted-foreground";

  return (
    <div className={cn("font-mono text-xs", className)}>
      {/* Stat bar */}
      <div className="mb-2 flex items-center gap-3 text-muted-foreground">
        <span>
          {t("headerDiffInbound")}:{" "}
          <span className="text-foreground">{headerDiff.inbound_count}</span>
        </span>
        <span className="text-divider">→</span>
        <span>
          {t("headerDiffOutbound")}:{" "}
          <span className="text-foreground">{headerDiff.outbound_count}</span>
        </span>
        <span className={cn("ml-auto tabular-nums font-medium", deltaClass)}>{deltaLabel}</span>
      </div>

      {/* Diff block */}
      <div className="overflow-hidden rounded border border-divider bg-surface-400/20">
        {/* Dropped lines */}
        {headerDiff.dropped.map((h) => (
          <div
            key={`drop-${h}`}
            className="flex items-baseline gap-2 border-b border-divider/40 bg-status-error/8 px-3 py-1 last:border-b-0"
          >
            <span className="w-3 shrink-0 select-none text-status-error">-</span>
            <code className="text-status-error line-through opacity-70">{h}</code>
          </div>
        ))}

        {/* Auth replaced */}
        {headerDiff.auth_replaced && (
          <div className="flex items-baseline gap-2 border-b border-divider/40 bg-status-warning/8 px-3 py-1 last:border-b-0">
            <span className="w-3 shrink-0 select-none text-status-warning">~</span>
            <code className="text-status-warning">{headerDiff.auth_replaced}</code>
            <span className="ml-1 text-[10px] text-muted-foreground">
              {t("headerDiffAuthReplaced")}
            </span>
          </div>
        )}

        {/* Compensated lines */}
        {headerDiff.compensated.map((c) => (
          <div
            key={`comp-${c.header}`}
            className="flex items-baseline gap-2 border-b border-divider/40 bg-status-success/8 px-3 py-1 last:border-b-0"
          >
            <span className="w-3 shrink-0 select-none text-status-success">+</span>
            <code className="text-amber-400">{c.header}</code>
            <span className="text-divider">:</span>
            <code className="flex-1 truncate text-foreground">{c.value}</code>
            <span className="ml-2 shrink-0 text-[10px] text-muted-foreground/60">← {c.source}</span>
          </div>
        ))}

        {/* Empty state */}
        {headerDiff.dropped.length === 0 &&
          !headerDiff.auth_replaced &&
          headerDiff.compensated.length === 0 && (
            <div className="px-3 py-2 text-muted-foreground/60">{t("headerDiffNoChanges")}</div>
          )}
      </div>
    </div>
  );
}
