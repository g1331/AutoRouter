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
        "relative flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-2",
        "border border-divider bg-surface-200",
        "font-mono text-xs uppercase tracking-wider",
        className
      )}
    >
      {/* Left: System identifier */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate font-semibold text-foreground">SYS.{systemId.toUpperCase()}</span>
        {children}
      </div>

      {/* Right: Status indicators */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {requestRate !== undefined && (
          <span className="rounded-cf-sm border border-divider bg-surface-300/60 px-2 py-0.5 text-muted-foreground">
            [↓ {requestRate.toFixed(1)}/s]
          </span>
        )}
        {timeRange && (
          <span className="rounded-cf-sm border border-divider bg-surface-300/60 px-2 py-0.5 text-muted-foreground">
            [{timeRange}]
          </span>
        )}
        {nodeCount !== undefined && (
          <span className="rounded-cf-sm border border-divider bg-surface-300/60 px-2 py-0.5 text-muted-foreground">
            [{nodeCount} NODES]
          </span>
        )}
        {isLive && (
          <span className="inline-flex items-center gap-1 rounded-cf-sm border border-status-info/40 bg-status-info-muted px-2 py-0.5 text-status-info">
            <span aria-hidden="true">●</span>
            <span>REC</span>
          </span>
        )}
      </div>
    </div>
  );
}
