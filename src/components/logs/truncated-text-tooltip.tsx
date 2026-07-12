"use client";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function TruncatedTextTooltip({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span className={cn("block min-w-0 truncate", className)}>{text}</span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className={cn(
          "p-2.5",
          "border-divider bg-surface-200 text-foreground",
          "shadow-[var(--vr-shadow-md)]",
          "max-w-[80vw] sm:max-w-[640px]"
        )}
      >
        <div className="font-mono text-[11px] leading-snug whitespace-pre-wrap break-words">
          {text}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
