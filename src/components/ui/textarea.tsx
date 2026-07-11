import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * M3 Text Area (Outlined variant)
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[120px] w-full rounded-cf-sm border border-divider bg-transparent px-4 py-3 type-body-large text-foreground transition-colors resize-none",
          "placeholder:text-muted-foreground",
          "hover:border-foreground",
          "focus-visible:outline-none focus-visible:border-2 focus-visible:border-amber-500",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:border-disabled-border",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
