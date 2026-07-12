import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { IconBox } from "@/components/ui/icon-box";

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * Shared page header (icon tile + label title + muted description) extracted from
 * the hand-written `Card` headers duplicated across the settings/logs pages.
 */
export function PageHeader({ icon: Icon, title, description, actions }: PageHeaderProps) {
  return (
    <Card variant="outlined" className="border-divider bg-surface-200/70">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-3">
          {Icon && (
            <IconBox>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </IconBox>
          )}
          <div className="space-y-1">
            <span className="type-label-medium block text-amber-500">{title}</span>
            {description && <p className="type-body-medium text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="self-start sm:self-auto">{actions}</div>}
      </CardContent>
    </Card>
  );
}
