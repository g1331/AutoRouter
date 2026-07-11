import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export function ExpandChevron({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <ChevronDown
      className={cn(
        "h-4 w-4 transition-transform duration-cf-fast ease-cf-standard motion-reduce:transform-none motion-reduce:transition-none",
        expanded && "rotate-180",
        className
      )}
      aria-hidden="true"
    />
  );
}
