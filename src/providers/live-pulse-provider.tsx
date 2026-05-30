"use client";

import { createContext, useContext } from "react";
import { useLivePulse, type UseLivePulseResult } from "@/hooks/use-live-pulse";

const LivePulseContext = createContext<UseLivePulseResult | undefined>(undefined);

/**
 * Holds a single live pulse connection for the whole dashboard.
 *
 * The dashboard layout persists across page navigation, so mounting the
 * connection here keeps one stream open instead of reconnecting on every page,
 * while the bar can be rendered in several places (desktop topbar, mobile strip)
 * that all read the same snapshot.
 */
export function LivePulseProvider({ children }: { children: React.ReactNode }) {
  const value = useLivePulse();

  return <LivePulseContext.Provider value={value}>{children}</LivePulseContext.Provider>;
}

/**
 * Read the shared live pulse snapshot and connection state.
 * Returns null when used outside the provider so callers can render nothing.
 */
export function useLivePulseContext(): UseLivePulseResult | null {
  return useContext(LivePulseContext) ?? null;
}
