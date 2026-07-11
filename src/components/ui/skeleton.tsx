import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("motion-safe:animate-pulse rounded-cf-sm bg-muted", className)} {...props} />
  );
}

export { Skeleton };
