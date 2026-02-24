import * as React from "react";

import { cn, warnIfForbiddenVisualStyle } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    warnIfForbiddenVisualStyle("Input", className);
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-cf-sm border border-input bg-surface-200 px-3.5 py-2",
          "type-body-medium text-foreground",
          "placeholder:text-muted-foreground/85",
          "transition-all duration-cf-normal ease-cf-standard",
          "hover:border-amber-500/45 hover:bg-surface-300/80",
          "focus-visible:outline-none focus-visible:border-amber-500/70",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "aria-invalid:border-status-error aria-invalid:text-status-error",
          "aria-invalid:placeholder:text-status-error/70",
          "aria-invalid:focus-visible:ring-status-error/45",
          "disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled-bg disabled:text-disabled-text",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
