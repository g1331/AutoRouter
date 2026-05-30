import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LivePulseBar } from "@/components/admin/live-pulse-bar";
import type { LivePulseSnapshot } from "@/hooks/use-live-pulse";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat("en-US", options).format(value),
  }),
}));

const SNAPSHOT: LivePulseSnapshot = {
  requestsPerMinute: 128,
  errorRatePct: 0.4,
  avgLatencyMs: 842,
  tokensPerMinute: 1_200_000,
  sampleCount: 128,
  windowSeconds: 60,
  generatedAt: "2026-05-30T00:00:00.000Z",
  gateway: { healthyUpstreams: 8, totalUpstreams: 9, openCircuitBreakers: 1 },
};

describe("LivePulseBar", () => {
  it("renders all metrics and the live status in full variant", () => {
    render(<LivePulseBar snapshot={SNAPSHOT} connectionState="live" variant="full" />);

    expect(screen.getByText("statusLive")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("0.4%")).toBeInTheDocument();
    expect(screen.getByText("842 ms")).toBeInTheDocument();
    expect(screen.getByText("1.2M")).toBeInTheDocument();
    expect(screen.getByText("8/9")).toBeInTheDocument();
    // open breakers count
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("maps the connection state to the fallback status label", () => {
    render(<LivePulseBar snapshot={SNAPSHOT} connectionState="fallback" variant="full" />);

    expect(screen.getByText("statusFallback")).toBeInTheDocument();
  });

  it("hides gateway and latency metrics in the compact variant", () => {
    render(<LivePulseBar snapshot={SNAPSHOT} connectionState="live" variant="compact" />);

    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("0.4%")).toBeInTheDocument();
    expect(screen.queryByText("842 ms")).not.toBeInTheDocument();
    expect(screen.queryByText("8/9")).not.toBeInTheDocument();
  });

  it("renders zeroed values when no snapshot is available yet", () => {
    render(<LivePulseBar snapshot={null} connectionState="connecting" variant="full" />);

    expect(screen.getByText("statusConnecting")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("0/0")).toBeInTheDocument();
  });
});
