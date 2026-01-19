"use client";

import * as React from "react";
import { Activity, AlertCircle, HelpCircle, Clock, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { UpstreamHealthResponse } from "@/types/api";

/**
 * Health status type for display purposes
 */
type HealthStatus = "healthy" | "unhealthy" | "unknown";

/**
 * Determines the health status from the API response
 */
function getHealthStatus(health: UpstreamHealthResponse | null | undefined): HealthStatus {
  if (!health || health.last_check_at === null) {
    return "unknown";
  }
  return health.is_healthy ? "healthy" : "unhealthy";
}

/**
 * Badge variant mapping for health status
 */
const statusVariant: Record<HealthStatus, "success" | "error" | "neutral"> = {
  healthy: "success",
  unhealthy: "error",
  unknown: "neutral",
};

/**
 * Icon mapping for health status
 */
const StatusIcon: Record<HealthStatus, React.ComponentType<{ className?: string }>> = {
  healthy: Activity,
  unhealthy: AlertCircle,
  unknown: HelpCircle,
};

/**
 * Label mapping for health status
 */
const statusLabel: Record<HealthStatus, string> = {
  healthy: "HEALTHY",
  unhealthy: "UNHEALTHY",
  unknown: "UNKNOWN",
};

/**
 * Formats a latency value for display
 */
function formatLatency(latencyMs: number | null): string | null {
  if (latencyMs === null) return null;
  if (latencyMs < 1000) {
    return `${latencyMs}ms`;
  }
  return `${(latencyMs / 1000).toFixed(1)}s`;
}

/**
 * Formats a timestamp for display
 */
function formatTime(timestamp: string | null): string | null {
  if (!timestamp) return null;
  try {
    const date = new Date(timestamp);
    // Use relative time for recent checks
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);

    if (diffSec < 60) {
      return `${diffSec}s ago`;
    } else if (diffMin < 60) {
      return `${diffMin}m ago`;
    } else if (diffHour < 24) {
      return `${diffHour}h ago`;
    }
    // For older timestamps, show the date/time
    return date.toLocaleString();
  } catch {
    return null;
  }
}

export interface UpstreamHealthStatusProps {
  /** Health status data from API */
  health: UpstreamHealthResponse | null | undefined;
  /** Whether to show extended details (latency, last check) */
  showDetails?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Upstream Health Status Indicator
 *
 * Displays the health status of an upstream with optional latency,
 * last check time, and error message tooltip.
 *
 * Features:
 * - Health status badge (healthy/unhealthy/unknown)
 * - Latency display
 * - Last check time
 * - Error message tooltip on unhealthy status
 */
export function UpstreamHealthStatus({
  health,
  showDetails = false,
  className,
}: UpstreamHealthStatusProps) {
  const status = getHealthStatus(health);
  const variant = statusVariant[status];
  const Icon = StatusIcon[status];
  const label = statusLabel[status];

  const latency = formatLatency(health?.latency_ms ?? null);
  const lastCheck = formatTime(health?.last_check_at ?? null);
  const errorMessage = health?.error_message;

  // Simple badge for minimal display
  if (!showDetails && !errorMessage) {
    return (
      <Badge variant={variant} className={cn("gap-1", className)}>
        <Icon className="h-3 w-3" />
        {label}
      </Badge>
    );
  }

  // Badge with tooltip for error messages
  const badgeContent = (
    <Badge variant={variant} className={cn("gap-1 cursor-default", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );

  const tooltipContent = (
    <div className="space-y-2 max-w-xs">
      {/* Status header */}
      <div className="font-semibold">
        {status === "healthy"
          ? "Upstream is responding normally"
          : status === "unhealthy"
            ? "Upstream is not responding"
            : "Health status not yet determined"}
      </div>

      {/* Latency info */}
      {latency && (
        <div className="flex items-center gap-2 text-xs">
          <Zap className="h-3 w-3 text-amber-500" />
          <span>Latency: {latency}</span>
        </div>
      )}

      {/* Last check info */}
      {lastCheck && (
        <div className="flex items-center gap-2 text-xs">
          <Clock className="h-3 w-3 text-amber-500" />
          <span>Last check: {lastCheck}</span>
        </div>
      )}

      {/* Failure count */}
      {health && health.failure_count > 0 && (
        <div className="flex items-center gap-2 text-xs text-status-error">
          <AlertCircle className="h-3 w-3" />
          <span>Consecutive failures: {health.failure_count}</span>
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <div className="pt-1 border-t border-divider">
          <div className="text-xs text-status-error break-words">{errorMessage}</div>
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{badgeContent}</TooltipTrigger>
        <TooltipContent side="top" align="center">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export interface UpstreamHealthStatusCompactProps {
  /** Health status data from API */
  health: UpstreamHealthResponse | null | undefined;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Compact Health Status Indicator
 *
 * A smaller indicator showing just latency with color-coded styling.
 * Useful for inline display in tables.
 */
export function UpstreamHealthStatusCompact({
  health,
  className,
}: UpstreamHealthStatusCompactProps) {
  const status = getHealthStatus(health);
  const latency = formatLatency(health?.latency_ms ?? null);
  const errorMessage = health?.error_message;

  const statusColors: Record<HealthStatus, string> = {
    healthy: "text-status-success",
    unhealthy: "text-status-error",
    unknown: "text-amber-700",
  };

  const content = (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-xs",
        statusColors[status],
        className
      )}
    >
      {status === "healthy" && <Activity className="h-3 w-3" />}
      {status === "unhealthy" && <AlertCircle className="h-3 w-3" />}
      {status === "unknown" && <HelpCircle className="h-3 w-3" />}
      {latency && <span>{latency}</span>}
      {!latency && status === "unknown" && <span>-</span>}
      {!latency && status !== "unknown" && <span>ERR</span>}
    </div>
  );

  // No tooltip needed if no error message
  if (!errorMessage) {
    return content;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div className="cursor-default">{content}</div>
        </TooltipTrigger>
        <TooltipContent side="top" align="center">
          <div className="max-w-xs text-xs text-status-error break-words">{errorMessage}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Health Status Dot
 *
 * A minimal dot indicator for use in tight spaces or as a subtle indicator.
 */
export interface HealthStatusDotProps {
  /** Health status data from API */
  health: UpstreamHealthResponse | null | undefined;
  /** Size of the dot */
  size?: "sm" | "md" | "lg";
  /** Additional CSS classes */
  className?: string;
}

export function HealthStatusDot({ health, size = "md", className }: HealthStatusDotProps) {
  const status = getHealthStatus(health);

  const sizeClasses: Record<typeof size, string> = {
    sm: "h-2 w-2",
    md: "h-2.5 w-2.5",
    lg: "h-3 w-3",
  };

  const statusColors: Record<HealthStatus, string> = {
    healthy: "bg-status-success",
    unhealthy: "bg-status-error",
    unknown: "bg-amber-700",
  };

  const pulseColors: Record<HealthStatus, string> = {
    healthy: "animate-pulse",
    unhealthy: "",
    unknown: "",
  };

  return (
    <div
      className={cn(
        "rounded-full",
        sizeClasses[size],
        statusColors[status],
        pulseColors[status],
        className
      )}
      title={statusLabel[status]}
    />
  );
}
