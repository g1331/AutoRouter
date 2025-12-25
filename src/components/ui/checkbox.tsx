"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Cassette Futurism Checkbox
 *
 * Terminal-style checkbox with amber styling
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-5 w-5 shrink-0 rounded-cf-sm border-2 border-amber-500",
      "transition-all duration-cf-fast ease-cf-standard",
      "hover:shadow-cf-glow-subtle",
      "focus-visible:outline-none focus-visible:ring-cf focus-visible:ring-amber-500 focus-visible:ring-offset-cf focus-visible:ring-offset-black-900",
      "disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled-bg",
      "data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500 data-[state=checked]:text-black-900",
      "data-[state=indeterminate]:bg-amber-500 data-[state=indeterminate]:border-amber-500 data-[state=indeterminate]:text-black-900",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
      <Check className="h-4 w-4" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
