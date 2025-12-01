import { cn } from "@/lib/utils";

/**
 * M3 Skeleton Loading Component
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--shape-corner-small)] bg-[rgb(var(--md-sys-color-surface-container-highest))]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
