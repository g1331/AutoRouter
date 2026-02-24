"use client";

import { cn } from "@/lib/utils";

export type LedStatus = "healthy" | "degraded" | "offline";

export interface StatusLedProps {
  status: LedStatus;
  label?: string;
  showLabel?: boolean;
  className?: string;
}

const LED_CONFIG: Record<
  LedStatus,
  {
    char: string;
    colorClass: string;
  }
> = {
  healthy: {
    char: "◉",
    colorClass: "text-status-success",
  },
  degraded: {
    char: "◎",
    colorClass: "text-amber-500",
  },
  offline: {
    char: "●",
    colorClass: "text-status-error",
  },
};

export function StatusLed({ status, label, showLabel = false, className }: StatusLedProps) {
  const config = LED_CONFIG[status];
  const displayLabel = label ?? status;

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 font-mono", className)}
      role="status"
      aria-label={`Status: ${displayLabel}`}
    >
      <span
        className={cn(
          "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current/35",
          config.colorClass
        )}
        aria-hidden="true"
      >
        <span className="text-[11px] leading-none">{config.char}</span>
      </span>
      {showLabel && (
        <span className={cn(config.colorClass, "text-xs uppercase tracking-[0.06em]")}>
          {displayLabel}
        </span>
      )}
    </span>
  );
}
