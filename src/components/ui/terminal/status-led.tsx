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
    glowColor: string;
    pulseClass: string;
  }
> = {
  healthy: {
    char: "◉",
    colorClass: "text-status-success",
    glowColor: "var(--status-success)",
    pulseClass: "motion-safe:animate-[cf-led-pulse_2s_ease-in-out_infinite]",
  },
  degraded: {
    char: "◎",
    colorClass: "text-amber-500",
    glowColor: "var(--cf-amber-500)",
    pulseClass: "motion-safe:animate-[cf-led-pulse_1s_ease-in-out_infinite]",
  },
  offline: {
    char: "●",
    colorClass: "text-status-error",
    glowColor: "var(--status-error)",
    pulseClass: "", // Static glow, no pulse
  },
};

export function StatusLed({ status, label, showLabel = false, className }: StatusLedProps) {
  const config = LED_CONFIG[status];
  const displayLabel = label ?? status;

  // Use box-shadow on a circular container for round glow effect
  const glowStyle: React.CSSProperties = {
    boxShadow: `0 0 4px 1px ${config.glowColor}, 0 0 8px 2px ${config.glowColor}`,
  };

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 font-mono", className)}
      role="status"
      aria-label={`Status: ${displayLabel}`}
    >
      {/* Circular glow container */}
      <span
        className={cn(
          // Ensure `currentColor` matches the LED state so any glow animations inherit correctly.
          config.colorClass,
          config.pulseClass,
          "relative inline-flex items-center justify-center"
        )}
        style={{ width: "14px", height: "14px" }}
        aria-hidden="true"
      >
        {/* Glow layer - circular */}
        <span className="absolute inset-0 rounded-full" style={glowStyle} />
        {/* Character layer */}
        <span
          className={cn(config.colorClass, "relative text-sm leading-none")}
          style={{ fontSize: "14px", lineHeight: 1 }}
        >
          {config.char}
        </span>
      </span>
      {showLabel && (
        <span className={cn(config.colorClass, "text-xs uppercase")}>{displayLabel}</span>
      )}
    </span>
  );
}
