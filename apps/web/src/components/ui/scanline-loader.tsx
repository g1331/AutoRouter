"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ScanlineLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Optional loading text */
  text?: string;
}

/**
 * Cassette Futurism Loading Indicator
 *
 * Terminal-style loader with scanline animation effect.
 * Respects prefers-reduced-motion for accessibility.
 */
const ScanlineLoader = React.forwardRef<HTMLDivElement, ScanlineLoaderProps>(
  ({ className, size = "md", text, ...props }, ref) => {
    const sizeClasses = {
      sm: "w-8 h-8",
      md: "w-12 h-12",
      lg: "w-16 h-16",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center gap-3",
          className
        )}
        role="status"
        aria-label={text || "Loading"}
        {...props}
      >
        {/* Scanline animated box */}
        <div
          className={cn(
            sizeClasses[size],
            "relative overflow-hidden",
            "rounded-cf-sm border-2 border-amber-500 bg-surface-300",
            // Scanline animation
            "before:absolute before:inset-0",
            "before:bg-gradient-to-b before:from-transparent before:via-amber-500/20 before:to-transparent",
            "before:animate-[scanline_1.5s_ease-in-out_infinite]",
            // Respect reduced motion
            "motion-reduce:before:animate-none motion-reduce:before:opacity-50"
          )}
        >
          {/* Inner glow pulse */}
          <div
            className={cn(
              "absolute inset-1 rounded-cf-sm bg-amber-500/10",
              "animate-pulse motion-reduce:animate-none"
            )}
          />
        </div>

        {/* Loading text */}
        {text && (
          <p className="font-mono text-sm text-amber-700 uppercase tracking-wider">
            {text}
          </p>
        )}
      </div>
    );
  }
);
ScanlineLoader.displayName = "ScanlineLoader";

export { ScanlineLoader };
