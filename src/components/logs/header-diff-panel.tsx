"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface HeaderDiff {
  inbound_count: number;
  outbound_count: number;
  dropped: Array<{ header: string; value: string }>;
  auth_replaced: {
    header: string;
    inbound_value: string | null;
    outbound_value: string;
  } | null;
  compensated: Array<{ header: string; source: string; value: string }>;
  unchanged: Array<{ header: string; value: string }>;
}

interface HeaderDiffPanelProps {
  headerDiff: HeaderDiff;
  className?: string;
}

function maskHeaderValue(value: string | null): string {
  if (!value) return "";
  if (value.length <= 6) return "***";
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

export function HeaderDiffPanel({ headerDiff, className }: HeaderDiffPanelProps) {
  const t = useTranslations("logs");
  const [showValues, setShowValues] = useState(false);

  const delta = headerDiff.outbound_count - headerDiff.inbound_count;
  const deltaLabel = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "±0";
  const deltaClass =
    delta > 0 ? "text-status-success" : delta < 0 ? "text-status-error" : "text-muted-foreground";

  const renderValue = (value: string | null) => {
    if (!value) return "";
    if (!showValues) return value.includes("***") ? value : maskHeaderValue(value);
    return value;
  };

  const valueClass = showValues ? "whitespace-pre-wrap break-all" : "truncate";
  const sourceClass = showValues
    ? "min-w-0 basis-full whitespace-pre-wrap break-all"
    : "shrink-0 whitespace-nowrap";

  return (
    <div className={cn("w-full min-w-0 font-mono text-xs", className)}>
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
        <button
          type="button"
          onClick={() => setShowValues((prev) => !prev)}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-divider px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          aria-label={showValues ? t("headerDiffHideValues") : t("headerDiffShowValues")}
        >
          {showValues ? (
            <EyeOff className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Eye className="h-3 w-3" aria-hidden="true" />
          )}
          <span>{showValues ? t("headerDiffHideValues") : t("headerDiffShowValues")}</span>
        </button>
      </div>

      <div className="overflow-hidden rounded border border-divider bg-surface-400/20">
        {headerDiff.dropped.map((item) => (
          <div
            key={`drop-${item.header}-${item.value}`}
            className="flex min-w-0 items-baseline gap-2 border-b border-divider/40 bg-status-error/8 px-3 py-1 last:border-b-0"
          >
            <span className="w-3 shrink-0 select-none text-status-error">-</span>
            <code className="text-status-error">{item.header}</code>
            <span className="text-divider">:</span>
            <code
              className={cn("flex-1 min-w-0 text-status-error line-through opacity-70", valueClass)}
            >
              {renderValue(item.value)}
            </code>
          </div>
        ))}

        {headerDiff.auth_replaced && (
          <div className="flex min-w-0 flex-wrap items-baseline gap-2 border-b border-divider/40 bg-status-warning/8 px-3 py-1 last:border-b-0">
            <span className="w-3 shrink-0 select-none text-status-warning">~</span>
            <code className="shrink-0 text-status-warning">{headerDiff.auth_replaced.header}</code>
            <span className="shrink-0 text-divider">:</span>
            <code
              className={cn(
                "min-w-0 flex-1 basis-[140px] text-status-warning line-through opacity-70",
                valueClass
              )}
            >
              {renderValue(headerDiff.auth_replaced.inbound_value)}
            </code>
            <span className="shrink-0 text-divider">→</span>
            <code className={cn("min-w-0 flex-1 text-status-warning", valueClass)}>
              {renderValue(headerDiff.auth_replaced.outbound_value)}
            </code>
            <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">
              {t("headerDiffAuthReplaced")}
            </span>
          </div>
        )}

        {headerDiff.compensated.map((item) => (
          <div
            key={`comp-${item.header}-${item.source}`}
            className="flex min-w-0 flex-wrap items-baseline gap-2 border-b border-divider/40 bg-status-success/8 px-3 py-1 last:border-b-0"
          >
            <span className="w-3 shrink-0 select-none text-status-success">+</span>
            <code className="shrink-0 text-amber-400">{item.header}</code>
            <span className="shrink-0 text-divider">:</span>
            <code className={cn("flex-1 min-w-0 text-foreground", valueClass)}>
              {renderValue(item.value)}
            </code>
            <span className={cn("ml-2 text-[10px] text-muted-foreground/60", sourceClass)}>
              ← {item.source}
            </span>
          </div>
        ))}

        {headerDiff.unchanged.map((item) => (
          <div
            key={`same-${item.header}-${item.value}`}
            className="flex min-w-0 items-baseline gap-2 border-b border-divider/40 px-3 py-1 text-muted-foreground last:border-b-0"
          >
            <span className="w-3 shrink-0 select-none">=</span>
            <code className="shrink-0">{item.header}</code>
            <span className="shrink-0 text-divider">:</span>
            <code className={cn("flex-1 min-w-0", valueClass)}>{renderValue(item.value)}</code>
            <span className="ml-2 shrink-0 text-[10px] text-muted-foreground/60">
              {t("headerDiffUnchanged")}
            </span>
          </div>
        ))}

        {headerDiff.dropped.length === 0 &&
          !headerDiff.auth_replaced &&
          headerDiff.compensated.length === 0 &&
          headerDiff.unchanged.length === 0 && (
            <div className="px-3 py-2 text-muted-foreground/60">{t("headerDiffNoChanges")}</div>
          )}
      </div>
    </div>
  );
}
