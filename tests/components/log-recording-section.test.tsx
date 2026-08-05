import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LogRecordingSection } from "@/components/admin/log-recording-section";
import type { TrafficRecordingByLogIdResult } from "@/hooks/use-traffic-recording";

const useTrafficRecordingByLogIdMock = vi.fn();

vi.mock("@/hooks/use-traffic-recording", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-traffic-recording")>();
  return {
    ...actual,
    useTrafficRecordingByLogId: (...args: unknown[]) => useTrafficRecordingByLogIdMock(...args),
  };
});

vi.mock("next-intl", () => ({
  useLocale: () => "en-US",
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
    const prefix = namespace ? `${namespace}.${key}` : key;
    return values && Object.keys(values).length > 0
      ? `${prefix}(${JSON.stringify(values)})`
      : prefix;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    variant?: string;
    size?: string;
    className?: string;
  }) => {
    if (asChild) return <>{children}</>;
    return <button type="button">{children}</button>;
  },
}));

vi.mock("@/components/admin/recording-json-block", () => ({
  RecordingJsonBlock: ({ value }: { value: unknown }) => (
    <div data-testid="recording-json-block">{JSON.stringify(value)}</div>
  ),
}));

const baseResult = (
  overrides: Partial<TrafficRecordingByLogIdResult>
): TrafficRecordingByLogIdResult => ({
  status: "idle",
  summary: null,
  detail: null,
  error: null,
  ...overrides,
});

describe("LogRecordingSection", () => {
  beforeEach(() => {
    useTrafficRecordingByLogIdMock.mockReset();
  });
  const expandSection = () => {
    fireEvent.click(screen.getByRole("button", { name: "trafficRecording.logSectionExpand" }));
  };

  it("renders idle state when not yet enabled", () => {
    useTrafficRecordingByLogIdMock.mockReturnValue(baseResult({ status: "idle" }));

    render(<LogRecordingSection logId="log-1" enabled={false} />);
    expandSection();

    expect(screen.getByText("trafficRecording.logSectionIdle")).toBeInTheDocument();
  });

  it("renders loading state while probing", () => {
    useTrafficRecordingByLogIdMock.mockReturnValue(baseResult({ status: "loading" }));

    render(<LogRecordingSection logId="log-1" enabled={true} />);
    expandSection();

    expect(screen.getByText("trafficRecording.logSectionLoading")).toBeInTheDocument();
  });

  it("renders absent state when no recording exists", () => {
    useTrafficRecordingByLogIdMock.mockReturnValue(baseResult({ status: "absent" }));

    render(<LogRecordingSection logId="log-1" enabled={true} />);
    expandSection();

    expect(screen.getByText("trafficRecording.logSectionAbsent")).toBeInTheDocument();
    expect(
      screen.getByText("trafficRecording.logSectionOpenRecordingSettings")
    ).toBeInTheDocument();
  });

  it("renders missing-file state with warning copy", () => {
    useTrafficRecordingByLogIdMock.mockReturnValue(
      baseResult({
        status: "missing-file",
        error: new Error("Fixture file missing"),
      })
    );

    render(<LogRecordingSection logId="log-1" enabled={true} />);
    expandSection();

    expect(screen.getByText("trafficRecording.logSectionMissingFile")).toBeInTheDocument();
    expect(screen.getByText("trafficRecording.logSectionOpenRecordings")).toBeInTheDocument();
  });

  it("renders error state with the underlying message", () => {
    useTrafficRecordingByLogIdMock.mockReturnValue(
      baseResult({
        status: "error",
        error: new Error("boom"),
      })
    );

    render(<LogRecordingSection logId="log-1" enabled={true} />);
    expandSection();

    expect(screen.getByText(/trafficRecording\.logSectionLoadFailed.*boom/)).toBeInTheDocument();
  });

  it("renders summary metadata and fixture after expanding the present state", () => {
    useTrafficRecordingByLogIdMock.mockReturnValue(
      baseResult({
        status: "present",
        summary: {
          id: "rec-1",
          request_log_id: "log-1",
          api_key_id: null,
          upstream_id: null,
          method: "POST",
          path: "/v1/chat/completions",
          model: "gpt-4o",
          status_code: 200,
          outcome: "success",
          fixture_path: "data/.../latest.json",
          fixture_size_bytes: 12345,
          request_size_bytes: 100,
          response_size_bytes: 1000,
          redacted: true,
          created_at: "2026-05-18T12:00:00.000Z",
        },
        detail: {
          id: "rec-1",
          request_log_id: "log-1",
          api_key_id: null,
          upstream_id: null,
          method: "POST",
          path: "/v1/chat/completions",
          model: "gpt-4o",
          status_code: 200,
          outcome: "success",
          fixture_path: "data/.../latest.json",
          fixture_size_bytes: 12345,
          request_size_bytes: 100,
          response_size_bytes: 1000,
          redacted: true,
          created_at: "2026-05-18T12:00:00.000Z",
          fixture: { meta: { requestId: "req-1" } },
        },
      })
    );

    render(<LogRecordingSection logId="log-1" enabled={true} />);

    expect(
      screen.getByRole("button", { name: "trafficRecording.logSectionExpand" })
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("200")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recording-json-block")).not.toBeInTheDocument();

    expandSection();

    expect(
      screen.getByRole("button", { name: "trafficRecording.logSectionCollapse" })
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
    expect(screen.getByText("12.1 KiB")).toBeInTheDocument();
    expect(screen.getByText("trafficRecording.redacted")).toBeInTheDocument();
    expect(screen.getByTestId("recording-json-block")).toHaveTextContent("requestId");
    expect(screen.getByText("trafficRecording.logSectionOpenRecordings")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "trafficRecording.logSectionCollapse" }));
    expect(screen.queryByTestId("recording-json-block")).not.toBeInTheDocument();
  });
});
