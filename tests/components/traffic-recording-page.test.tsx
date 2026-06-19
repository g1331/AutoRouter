import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TrafficRecordingPage from "@/app/[locale]/(dashboard)/system/traffic-recording/page";

const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const cleanupMutate = vi.fn();
const useTrafficRecordingsMock = vi.fn();
const writeTextMock = vi.fn();

Object.assign(navigator, {
  clipboard: {
    writeText: writeTextMock,
  },
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en-US",
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock("@/components/admin/topbar", () => ({
  Topbar: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/components/admin/pagination-controls", () => ({
  PaginationControls: () => <nav data-testid="pagination-controls" />,
}));

vi.mock("@/components/dashboard/time-range-selector", () => ({
  TimeRangeSelector: ({ onChange }: { onChange: (value: string) => void }) => (
    <div data-testid="time-range-selector">
      <button type="button" onClick={() => onChange("today")}>
        dashboard.timeRange.today
      </button>
      <button type="button" onClick={() => onChange("7d")}>
        dashboard.timeRange.7d
      </button>
      <button type="button" onClick={() => onChange("30d")}>
        dashboard.timeRange.30d
      </button>
      <button type="button" onClick={() => onChange("custom")}>
        dashboard.timeRange.custom
      </button>
    </div>
  ),
}));

vi.mock("@/hooks/use-traffic-recording", () => ({
  useTrafficRecordingSettings: () => ({
    data: {
      enabled: true,
      mode: "failure",
      redact_sensitive: true,
      retention_days: 7,
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  }),
  useUpdateTrafficRecordingSettings: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteTrafficRecording: () => ({ mutate: deleteMutate, isPending: false }),
  useCleanupTrafficRecordings: () => ({ mutate: cleanupMutate, isPending: false }),
  useTrafficRecordings: (...args: unknown[]) => useTrafficRecordingsMock(...args),
  useTrafficRecordingDetail: (id: string | null) => ({
    isLoading: false,
    isError: false,
    data: id ? { fixture: { meta: { requestId: "req-1" } } } : undefined,
  }),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <button type="button" value={value}>
      {children}
    </button>
  ),
  SelectTrigger: ({
    children,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    "aria-label"?: string;
  }) => <button aria-label={ariaLabel}>{children}</button>,
  SelectValue: () => <span />,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  ),
}));

vi.mock("@/components/ui/table", () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
}));

vi.mock("lucide-react", () => ({
  Check: () => <svg data-testid="icon-check" />,
  ChevronDown: () => <svg data-testid="icon-chevron-down" />,
  ChevronRight: () => <svg data-testid="icon-chevron-right" />,
  Copy: () => <svg data-testid="icon-copy" />,
  DatabaseZap: () => <svg data-testid="icon-database-zap" />,
  ExternalLink: () => <svg data-testid="icon-external-link" />,
  FileJson: () => <svg data-testid="icon-file-json" />,
  Loader2: () => <svg data-testid="icon-loader" />,
  Save: () => <svg data-testid="icon-save" />,
  Search: () => <svg data-testid="icon-search" />,
  Trash2: () => <svg data-testid="icon-trash" />,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("TrafficRecordingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeTextMock.mockResolvedValue(undefined);
  });

  it("renders runtime controls, filters, table rows, and detail view", () => {
    useTrafficRecordingsMock.mockReturnValue({
      isLoading: false,
      data: {
        items: [
          {
            id: "recording-1",
            request_log_id: "log-1",
            api_key_id: "key-1",
            upstream_id: "upstream-1",
            method: "POST",
            path: "v1/chat/completions",
            model: "gpt-4.1",
            status_code: 200,
            outcome: "success",
            fixture_path: "data/traffic-recordings/openai/chat/fixture.json",
            fixture_size_bytes: 512,
            request_size_bytes: 64,
            response_size_bytes: 256,
            redacted: true,
            created_at: "2026-01-02T00:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
        total_pages: 1,
        stats: {
          total: 1,
          total_size_bytes: 512,
          latest_created_at: "2026-01-02T00:00:00.000Z",
        },
      },
    });

    render(<TrafficRecordingPage />);

    expect(screen.getByText("trafficRecording.pageTitle")).toBeInTheDocument();
    expect(screen.getByText("trafficRecording.description")).toBeInTheDocument();
    expect(screen.getByLabelText("trafficRecording.modelSearchPlaceholder")).toBeInTheDocument();
    expect(screen.getByLabelText("trafficRecording.apiKeyFilterPlaceholder")).toBeInTheDocument();
    expect(screen.getByLabelText("trafficRecording.upstreamFilterPlaceholder")).toBeInTheDocument();
    expect(screen.getByText("dashboard.timeRange.today")).toBeInTheDocument();
    expect(screen.getByText("dashboard.timeRange.7d")).toBeInTheDocument();
    expect(screen.getByText("dashboard.timeRange.30d")).toBeInTheDocument();
    expect(screen.getByText("dashboard.timeRange.custom")).toBeInTheDocument();
    expect(screen.getAllByText("gpt-4.1").length).toBeGreaterThan(0);

    // 宽表（hidden lg:block）与窄屏卡片（lg:hidden）各渲染一份操作按钮，jsdom 不应用 CSS 隐藏，
    // 故同名按钮成对出现；点击任一份即可，JSON 详情块与复制按钮在下方独立卡片只渲染一份。
    fireEvent.click(screen.getAllByRole("button", { name: /trafficRecording.viewDetail/i })[0]);
    expect(screen.getByText('"meta":')).toBeInTheDocument();
    expect(screen.getByText('"requestId":')).toBeInTheDocument();
    expect(screen.getByText('"req-1"')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "common.copy" }));
    expect(writeTextMock).toHaveBeenCalledWith(
      JSON.stringify({ meta: { requestId: "req-1" } }, null, 2)
    );

    fireEvent.click(screen.getAllByRole("button", { name: "trafficRecording.delete" })[0]);
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "common.cancel" }).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "trafficRecording.deleteConfirmAction" }).length
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "common.cancel" })[0]);
    expect(
      screen.queryAllByRole("button", { name: "trafficRecording.deleteConfirmAction" })
    ).toHaveLength(0);

    fireEvent.click(screen.getAllByRole("button", { name: "trafficRecording.delete" })[0]);
    fireEvent.click(
      screen.getAllByRole("button", { name: "trafficRecording.deleteConfirmAction" })[0]
    );
    expect(deleteMutate).toHaveBeenCalledWith("recording-1");
  });

  it("renders 'open source log' link only when request_log_id is present", () => {
    useTrafficRecordingsMock.mockReturnValue({
      isLoading: false,
      data: {
        items: [
          {
            id: "rec-with-log",
            request_log_id: "log-1",
            api_key_id: null,
            upstream_id: null,
            method: "POST",
            path: "v1/chat/completions",
            model: "gpt-4.1",
            status_code: 200,
            outcome: "success",
            fixture_path: "data/.../latest.json",
            fixture_size_bytes: 1,
            request_size_bytes: 0,
            response_size_bytes: 0,
            redacted: true,
            created_at: "2026-01-02T00:00:00.000Z",
          },
          {
            id: "rec-without-log",
            request_log_id: null,
            api_key_id: null,
            upstream_id: null,
            method: "POST",
            path: "v1/chat/completions",
            model: "gpt-4.1",
            status_code: 200,
            outcome: "success",
            fixture_path: "data/.../other.json",
            fixture_size_bytes: 1,
            request_size_bytes: 0,
            response_size_bytes: 0,
            redacted: true,
            created_at: "2026-01-02T00:00:00.000Z",
          },
        ],
        total: 2,
        page: 1,
        page_size: 20,
        total_pages: 1,
        stats: {
          total: 2,
          total_size_bytes: 2,
          latest_created_at: "2026-01-02T00:00:00.000Z",
        },
      },
    });

    render(<TrafficRecordingPage />);

    // 宽表与窄屏卡片各渲染一份链接：含 request_log_id 的记录产生 2 个链接，无 log 的记录 0 个；
    // 总数为 2（而非 4）即证明链接仅对存在源日志的记录渲染。
    const links = screen.getAllByRole("link", { name: /trafficRecording.openSourceLog/i });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/logs?focus=log-1");
    }
  });
});
