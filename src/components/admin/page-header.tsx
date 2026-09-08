import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { IconBox } from "@/components/ui/icon-box";

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** 页面身份与主操作；仅在需要解释业务约束时提供说明。 */
export function PageHeader({ icon: Icon, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <IconBox>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </IconBox>
        )}
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl break-words">
            {title}
          </h1>
          {description && (
            <p className="type-body-medium max-w-3xl text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">{actions}</div>
      )}
    </header>
  );
}
