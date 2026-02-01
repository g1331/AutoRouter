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
  { char: string; colorClass: string; glowStyle: React.CSSProperties; pulseClass: string }
> = {
  healthy: {
    char: "◉",
    colorClass: "text-status-success",
    glowStyle: { textShadow: "0 0 6px var(--status-success), 0 0 12px var(--status-success)" },
    pulseClass: "motion-safe:animate-[cf-led-pulse_2s_ease-in-out_infinite]",
  },
  degraded: {
    char: "◎",
    colorClass: "text-amber-500",
    glowStyle: { textShadow: "0 0 6px var(--cf-amber-500), 0 0 12px var(--cf-amber-500)" },
    pulseClass: "motion-safe:animate-[cf-led-pulse_1s_ease-in-out_infinite]",
  },
  offline: {
    char: "●",
    colorClass: "text-status-error",
    glowStyle: { textShadow: "0 0 8px var(--status-error), 0 0 16px var(--status-error)" },
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
        className={cn(config.colorClass, config.pulseClass, "text-sm leading-none")}
        style={config.glowStyle}
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
