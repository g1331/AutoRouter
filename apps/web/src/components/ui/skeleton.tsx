import { cn } from "@/lib/utils";

/**
 * Cassette Futurism Skeleton Loading
 *
 * Terminal-style loading placeholder with scanline animation.
 * Respects prefers-reduced-motion.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-cf-sm bg-surface-400",
        // Scanline animation effect
        "before:absolute before:inset-0",
        "before:bg-gradient-to-r before:from-transparent before:via-amber-500/10 before:to-transparent",
        "before:animate-[shimmer_2s_infinite]",
        // Respect reduced motion
        "motion-reduce:before:animate-none",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
