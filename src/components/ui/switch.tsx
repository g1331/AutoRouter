"use client";

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full border border-border",
      "bg-surface-400 transition-all duration-cf-fast ease-cf-standard",
      // 仅浅色态：默认 OFF 轨 bg-surface-400(#eaedf0) 对页底仅约 1.03:1，违反 WCAG
      // 1.4.11（组件边界需 ≥3:1）。下探到 ≥3:1 的中性灰并加深边框，深色态不变。
      "light:data-[state=unchecked]:border-divider-subtle light:data-[state=unchecked]:bg-[#818892]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:border-status-success/45 data-[state=checked]:bg-status-success",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-[var(--vr-shadow-xs)]",
        "ring-0 transition-transform duration-cf-fast ease-cf-standard",
        // 仅浅色态且仅 OFF：拇指加内描边，使其在浅轨上有清晰边界、OFF 位可辨；
        // ON（绿）态不加环，保持不变。
        "light:data-[state=unchecked]:ring-1 light:data-[state=unchecked]:ring-inset light:data-[state=unchecked]:ring-black/15",
        "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
