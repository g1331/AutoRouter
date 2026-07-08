import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PortalOverviewPage from "@/app/[locale]/(portal)/portal/page";
import PortalRequestsPage from "@/app/[locale]/(portal)/portal/requests/page";
import PortalKeysPage from "@/app/[locale]/(portal)/portal/keys/page";

const usePortalOverviewMock = vi.fn();
const usePortalUsageMock = vi.fn();
const usePortalRequestLogsMock = vi.fn();
const usePortalKeysMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
  useLocale: () => "en",
}));

vi.mock("@/hooks/use-portal-overview", () => ({
  usePortalOverview: (...args: unknown[]) => usePortalOverviewMock(...args),
  usePortalUsage: (...args: unknown[]) => usePortalUsageMock(...args),
}));

vi.mock("@/hooks/use-portal-logs", () => ({
  usePortalRequestLogs: (...args: unknown[]) => usePortalRequestLogsMock(...args),
}));

vi.mock("@/hooks/use-portal-keys", () => ({
  usePortalKeys: (...args: unknown[]) => usePortalKeysMock(...args),
}));

vi.mock("@/components/admin/topbar", () => ({
  Topbar: ({ title }: { title: string }) => <header>{title}</header>,
}));

vi.mock("@/components/portal/portal-usage-chart", () => ({
  PortalUsageChart: ({ range }: { range: string }) => (
    <div data-testid="usage-chart" data-range={range} />
  ),
}));

vi.mock("@/components/admin/logs-table", () => ({
  DEFAULT_LOGS_SERVER_FILTERS: { statusClass: "all", model: "", timeRange: "30d" },
  LogsTable: ({
    logs,
    hideRecordingSection,
  }: {
    logs: Array<{ id: string }>;
    hideRecordingSection?: boolean;
  }) => (
    <div
      data-testid="logs-table"
      data-log-count={logs.length}
      data-hide-recording={String(Boolean(hideRecordingSection))}
    />
  ),
}));

vi.mock("@/components/admin/pagination-controls", () => ({
  PaginationControls: () => <nav data-testid="pagination" />,
}));

vi.mock("@/components/admin/refresh-interval-select", () => ({
  RefreshIntervalSelect: () => <div data-testid="refresh-select" />,
}));

vi.mock("@/components/portal/portal-keys-table", () => ({
  PortalKeysTable: ({ keys }: { keys: Array<{ id: string }> }) => (
    <div data-testid="portal-keys-table" data-key-count={keys.length} />
  ),
}));

vi.mock("@/components/portal/portal-key-dialog", () => ({
  PortalKeyDialog: ({ mode, open }: { mode: string; open: boolean }) =>
    open ? <div data-testid={`portal-key-dialog-${mode}`} /> : null,
}));

vi.mock("@/components/portal/portal-revoke-key-dialog", () => ({
  PortalRevokeKeyDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="portal-revoke-dialog" /> : null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  usePortalOverviewMock.mockReturnValue({ data: undefined, isLoading: true });
  usePortalUsageMock.mockReturnValue({ data: undefined, isLoading: true });
  usePortalRequestLogsMock.mockReturnValue({
    data: undefined,
    isLoading: true,
    isFetching: false,
    refetch: vi.fn(),
  });
  usePortalKeysMock.mockReturnValue({ data: undefined, isLoading: true });
});

describe("PortalOverviewPage", () => {
  it("renders the personal aggregates once loaded", () => {
    usePortalOverviewMock.mockReturnValue({
      data: {
        today_requests: 12,
        month_requests: 340,
        month_cost_usd: 1.25,
        total_requests: 9000,
        total_cost_usd: 25.5,
        active_key_count: 2,
        total_key_count: 3,
      },
      isLoading: false,
    });
    usePortalUsageMock.mockReturnValue({ data: { points: [] }, isLoading: false });

    render(<PortalOverviewPage />);

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("340")).toBeInTheDocument();
    expect(screen.getByText("$1.25")).toBeInTheDocument();
    expect(screen.getByTestId("usage-chart")).toHaveAttribute("data-range", "7d");
  });
});

describe("PortalRequestsPage", () => {
  it("feeds the caller's logs into the shared logs table", () => {
    usePortalRequestLogsMock.mockReturnValue({
      data: {
        items: [{ id: "log-1" }, { id: "log-2" }],
        total: 2,
        page: 1,
        page_size: 20,
        total_pages: 1,
      },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<PortalRequestsPage />);

    expect(screen.getByTestId("logs-table")).toHaveAttribute("data-log-count", "2");
    // The portal must hide the admin-only recording section in the shared table.
    expect(screen.getByTestId("logs-table")).toHaveAttribute("data-hide-recording", "true");
    // Single page → no pagination card.
    expect(screen.queryByTestId("pagination")).not.toBeInTheDocument();
  });
});

describe("PortalKeysPage", () => {
  it("renders the key list and opens the create dialog", () => {
    usePortalKeysMock.mockReturnValue({
      data: { items: [{ id: "key-1" }], total: 1, page: 1, page_size: 10, total_pages: 1 },
      isLoading: false,
    });

    render(<PortalKeysPage />);

    expect(screen.getByTestId("portal-keys-table")).toHaveAttribute("data-key-count", "1");
    expect(screen.queryByTestId("portal-key-dialog-create")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /keys.createKey/ }));
    expect(screen.getByTestId("portal-key-dialog-create")).toBeInTheDocument();
  });
});
