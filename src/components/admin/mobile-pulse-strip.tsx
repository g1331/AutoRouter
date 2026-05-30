"use client";

import { useLivePulseContext } from "@/providers/live-pulse-provider";
import { LivePulseBar } from "./live-pulse-bar";

/**
 * Compact live pulse strip for mobile, where the desktop topbar is hidden.
 * Sits as a thin row at the top of the content area so the core status stays
 * visible without crowding the page title or the back navigation.
 */
export function MobilePulseStrip() {
  const pulse = useLivePulseContext();

  if (!pulse) {
    return null;
  }

  return (
    <div className="sticky top-0 z-10 border-b border-divider bg-surface-200/88 px-3 py-2 backdrop-blur md:hidden">
      <LivePulseBar
        snapshot={pulse.snapshot}
        connectionState={pulse.connectionState}
        variant="compact"
      />
    </div>
  );
}
