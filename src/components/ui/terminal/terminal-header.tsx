"use client";

import { cn } from "@/lib/utils";

export interface TerminalHeaderProps {
  systemId: string;
  nodeCount?: number;
  isLive?: boolean;
  timeRange?: string;
  requestRate?: number;
  className?: string;
  children?: React.ReactNode;
}

export function TerminalHeader({
  systemId,
  nodeCount,
  isLive,
  timeRange,
  requestRate,
  className,
  children,
}: TerminalHeaderProps) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-between px-4 py-2",
        "bg-surface-200 border border-surface-400",
        "font-mono text-xs uppercase tracking-wider",
        "cf-scanlines",
        className
      )}
    >
      {/* Left: System identifier */}
      <div className="flex items-center gap-3">
        <span className="text-amber-500 font-semibold">SYS.{systemId.toUpperCase()}</span>
        {children}
      </div>

      {/* Right: Status indicators */}
      <div className="flex items-center gap-2">
        {requestRate !== undefined && (
          <span className="text-amber-600 border border-amber-600/30 px-2 py-0.5">
            [↓ {requestRate.toFixed(1)}/s]
          </span>
        )}
        {timeRange && (
          <span className="text-amber-600 border border-amber-600/30 px-2 py-0.5">
            [{timeRange}]
          </span>
        )}
        {nodeCount !== undefined && (
          <span className="text-amber-600 border border-amber-600/30 px-2 py-0.5">
            [{nodeCount} NODES]
          </span>
        )}
        {isLive && (
          <span
            className="flex items-center gap-1 text-status-error border border-status-error/50 px-2 py-0.5"
            style={{ textShadow: "0 0 4px var(--status-error)" }}
          >
            <span
              className="motion-safe:animate-[cf-led-pulse_1s_ease-in-out_infinite]"
              aria-hidden="true"
            >
              ●
            </span>
            <span>REC</span>
          </span>
        )}
      </div>
    </div>
  );
}
