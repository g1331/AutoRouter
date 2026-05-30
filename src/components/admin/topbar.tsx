"use client";

import { useLivePulseContext } from "@/providers/live-pulse-provider";
import { LivePulseBar } from "./live-pulse-bar";

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  const pulse = useLivePulseContext();

  return (
    <header className="sticky top-0 z-20 hidden w-full border-b border-divider bg-surface-200/88 backdrop-blur md:block">
      <div className="flex h-14 items-center justify-between gap-4 px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="hidden text-xs tracking-[0.08em] text-muted-foreground sm:inline">
            {">>"}
          </span>
          <h1 className="type-title-medium tracking-[0.08em] text-foreground">
            {title.toUpperCase()}
          </h1>
        </div>

        {pulse && (
          <>
            <LivePulseBar
              snapshot={pulse.snapshot}
              connectionState={pulse.connectionState}
              variant="full"
              className="hidden lg:flex"
            />
            <LivePulseBar
              snapshot={pulse.snapshot}
              connectionState={pulse.connectionState}
              variant="compact"
              className="flex lg:hidden"
            />
          </>
        )}
      </div>
    </header>
  );
}
