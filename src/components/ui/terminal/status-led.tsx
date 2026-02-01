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
  { char: string; colorClass: string; glowClass: string; pulseClass: string }
> = {
  healthy: {
    char: "◉",
    colorClass: "text-status-success",
    glowClass: "drop-shadow-[0_0_4px_var(--status-success)]",
    pulseClass: "motion-safe:animate-[cf-led-pulse_2s_ease-in-out_infinite]",
  },
  degraded: {
    char: "◎",
    colorClass: "text-amber-500",
    glowClass: "drop-shadow-[0_0_4px_var(--cf-amber-500)]",
    pulseClass: "motion-safe:animate-[cf-led-pulse_1s_ease-in-out_infinite]",
  },
  offline: {
    char: "●",
    colorClass: "text-status-error",
    glowClass: "drop-shadow-[0_0_6px_var(--status-error)]",
    pulseClass: "", // Static glow, no pulse
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
          config.colorClass,
          config.glowClass,
          config.pulseClass,
          "text-sm leading-none"
        )}
        aria-hidden="true"
      >
        {config.char}
      </span>
      {showLabel && (
        <span className={cn(config.colorClass, "text-xs uppercase")}>{displayLabel}</span>
      )}
    </span>
  );
}
