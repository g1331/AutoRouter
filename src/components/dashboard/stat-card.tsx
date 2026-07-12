import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  isLoading?: boolean;
}

/**
 * Compact overview metric card shared by the member portal overview and the admin
 * per-user usage page. Values use the Tier-1 display family (Saira) with tabular
 * figures so numeric readouts stay aligned.
 */
export function StatCard({ icon: Icon, label, value, hint, isLoading }: StatCardProps) {
  return (
    <Card variant="outlined" className="border-divider bg-surface-200/70">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4 text-amber-500" aria-hidden="true" />
          <span className="type-label-medium">{label}</span>
        </div>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="type-display-small tabular-nums text-foreground">{value}</p>
        )}
        {hint && <p className="type-body-small text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
