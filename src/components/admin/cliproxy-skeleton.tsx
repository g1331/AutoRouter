import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** CLIProxy 面板使用可在明暗主题中辨认的中性占位色。 */
export function CliproxySkeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <Skeleton className={cn("bg-foreground/20", className)} {...props} />;
}
