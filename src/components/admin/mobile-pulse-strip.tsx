"use client";

import { useLivePulseContext } from "@/providers/live-pulse-provider";
import { LivePulseBar } from "./live-pulse-bar";

/**
 * Compact live pulse for the mobile top bar, where the desktop topbar is hidden.
 * Renders only the bar itself; the surrounding mobile header in the dashboard
 * layout provides the sticky row so the back button and the pulse share one bar
 * without stacking two sticky headers.
 */
export function MobilePulseStrip() {
  const pulse = useLivePulseContext();

  if (!pulse) {
    return null;
  }

  return (
    <LivePulseBar
      snapshot={pulse.snapshot}
      connectionState={pulse.connectionState}
      variant="compact"
    />
  );
}
