"use client";

import { statusTone } from "@/lib/status-tone";
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
    compactLabel: string;
    toneClass: string;
  }
> = {
  healthy: {
    compactLabel: "OK",
    toneClass: statusTone("success"),
  },
  degraded: {
    compactLabel: "WARN",
    toneClass: statusTone("warning"),
  },
  offline: {
    compactLabel: "DOWN",
    toneClass: statusTone("error"),
  },
};

export function StatusLed({ status, label, showLabel = false, className }: StatusLedProps) {
  const config = LED_CONFIG[status];
  const displayLabel = label ?? status;
  const visualLabel = showLabel ? displayLabel : config.compactLabel;

  return (
    <span
      className={cn("inline-flex items-center font-mono", className)}
      role="status"
      aria-label={`Status: ${displayLabel}`}
    >
      <span
        className={cn(
          "inline-flex items-center whitespace-nowrap rounded-cf-sm border px-1.5 py-0.5 text-[11px] leading-none",
          config.toneClass
        )}
      >
        {visualLabel}
      </span>
    </span>
  );
}
