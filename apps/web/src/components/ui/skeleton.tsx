import { cn } from "@/lib/utils";

type SkeletonVariant = "counter" | "inline";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Placeholder text displayed during loading (default: "---") */
  placeholder?: string | number;
  /** Display variant: "counter" for large stats, "inline" for text */
  variant?: SkeletonVariant;
  /** Show blinking cursor after placeholder */
  showCursor?: boolean;
  /** Show CRT scanline overlay effect */
  scanlines?: boolean;
}

/**
 * Cassette Futurism CRT Loading Indicator
 *
 * Terminal-style placeholder with:
 * - VT323 display font for retro appearance
 * - Optional CRT scanline overlay
 * - Blinking block cursor
 * - Amber glow effect
 *
 * Respects prefers-reduced-motion.
 */
function Skeleton({
  className,
  placeholder = "---",
  variant = "counter",
  showCursor = true,
  scanlines = true,
  ...props
}: SkeletonProps) {
  const displayText = String(placeholder);

  // Type-safe variant styles with min dimensions to prevent CLS
  const variantStyles: Record<SkeletonVariant, string> = {
    counter: "text-5xl tracking-[0.18em] px-4 py-3 min-w-24 min-h-16",
    inline: "text-base tracking-[0.08em] px-3 py-2",
  };

  const isInline = variant === "inline";

  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        // Base container - inline-flex for inline variant
        "relative isolate overflow-hidden",
        isInline ? "inline-flex items-baseline" : "flex items-center justify-center",
        "rounded-cf-sm border border-amber-500/40 bg-surface-400",
        // Ambient glow
        "shadow-[0_0_12px_rgba(255,191,0,0.18)]",
        // CRT scanlines overlay - disabled for reduced motion
        scanlines && [
          "before:pointer-events-none before:absolute before:inset-0",
          "before:bg-[repeating-linear-gradient(0deg,rgba(255,191,0,0.06)_0px,rgba(255,191,0,0.06)_1px,transparent_1px,transparent_3px)]",
          "before:opacity-80",
          // Radial glow center
          "after:pointer-events-none after:absolute after:inset-0",
          "after:bg-[radial-gradient(circle_at_50%_30%,rgba(255,191,0,0.1),transparent_50%)]",
          // Fully hide overlays for reduced motion users
          "motion-reduce:before:hidden motion-reduce:after:hidden",
        ],
        className
      )}
      {...props}
    >
      <span
        className={cn(
          // Typography
          "relative z-10 flex items-center font-display leading-none text-amber-500",
          // Glow effect on text (reduced for motion-sensitive)
          "drop-shadow-[0_0_6px_rgba(255,191,0,0.35)]",
          "motion-reduce:drop-shadow-none",
          // Variant-specific sizing
          variantStyles[variant]
        )}
      >
        <span>{displayText}</span>
        {showCursor && (
          <span
            className={cn(
              "ml-1 inline-block h-[0.85em] w-[0.35em] bg-amber-400/80",
              "animate-[cf-blink_1s_step-end_infinite]",
              // Hide cursor entirely for reduced motion
              "motion-reduce:hidden"
            )}
            aria-hidden="true"
          />
        )}
      </span>
    </div>
  );
}

export { Skeleton };
export type { SkeletonProps, SkeletonVariant };
