"use client";

import * as React from "react";
import { OctagonAlert, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Error title */
  title?: string;
  /** Error description */
  description?: string;
  /** Retry callback */
  onRetry?: () => void;
  /** Whether retry is in progress */
  isRetrying?: boolean;
}

/**
 * Cassette Futurism Error State
 *
 * Terminal-style error display with red glow border and icon.
 * Includes optional retry functionality.
 */
const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  (
    {
      className,
      title = "SYSTEM ERROR",
      description = "An error occurred. Please try again.",
      onRetry,
      isRetrying = false,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center py-12 px-6 text-center",
          className
        )}
        role="alert"
        {...props}
      >
        {/* Error icon container with red glow */}
        <div
          className={cn(
            "w-16 h-16 rounded-cf-sm",
            "bg-status-error-muted border-2 border-status-error",
            "shadow-cf-glow-error",
            "flex items-center justify-center mb-4"
          )}
        >
          <OctagonAlert
            className="w-8 h-8 text-status-error"
            strokeWidth={2.25}
            aria-hidden="true"
          />
        </div>

        {/* Error title */}
        <h3 className="font-mono text-lg font-medium text-status-error mb-2 tracking-wide">
          [ERROR] {title}
        </h3>

        {/* Error description */}
        <p className="font-sans text-sm text-amber-700 max-w-md mb-6">{description}</p>

        {/* Retry button */}
        {onRetry && (
          <Button
            variant="outline"
            onClick={onRetry}
            disabled={isRetrying}
            className="gap-2 border-status-error text-status-error hover:bg-status-error-muted"
          >
            <RefreshCw className={cn("w-4 h-4", isRetrying && "animate-spin")} aria-hidden="true" />
            {isRetrying ? "RETRYING..." : "RETRY"}
          </Button>
        )}
      </div>
    );
  }
);
ErrorState.displayName = "ErrorState";

export { ErrorState };
