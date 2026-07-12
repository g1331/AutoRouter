import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LogsPage from "@/app/[locale]/(dashboard)/logs/page";

const useSearchParamsMock = vi.fn();
const useRequestLogsMock = vi.fn();
const useRequestLogLiveMock = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  usePathname: () => "/logs",
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock("@/hooks/use-request-logs", () => ({
  useRequestLogs: (...args: unknown[]) => useRequestLogsMock(...args),
}));

vi.mock("@/hooks/use-request-log-live", () => ({
  useRequestLogLive: (...args: unknown[]) => useRequestLogLiveMock(...args),
}));

vi.mock("@/hooks/use-upstreams", () => ({
  useAllUpstreams: () => ({ data: [{ id: "up-1", name: "Upstream One" }] }),
}));

vi.mock("@/hooks/use-api-keys", () => ({
  useAPIKeys: () => ({ data: { items: [{ id: "key-1", name: "Key One" }] } }),
}));

interface LogsTableMockProps {
  logs: Array<{ id: string }>;
  isLive?: boolean;
  initialExpandedIds?: readonly string[];
  onServerFiltersChange?: (patch: Record<string, unknown>) => void;
  upstreamFilterOptions?: Array<{ id: string; name: string }>;
  apiKeyFilterOptions?: Array<{ id: string; name: string }>;
}

let lastLogsTableProps: LogsTableMockProps | null = null;

// Keep the real DEFAULT_LOGS_SERVER_FILTERS / resolvePerfPresetParams so the
// page-level preset→param mapping under test uses the actual thresholds.
vi.mock("@/components/admin/logs-table", async (importActual) => {
  const actual = await importActual<typeof import("@/components/admin/logs-table")>();
  return {
    ...actual,
    LogsTable: (props: LogsTableMockProps) => {
      lastLogsTableProps = props;
      return (
        <div
          data-testid="logs-table"
          data-log-count={props.logs.length}
          data-initial-expanded={(props.initialExpandedIds ?? []).join(",")}
        />
      );
    },
  };
});

vi.mock("@/components/admin/pagination-controls", () => ({
  PaginationControls: ({ onPageChange }: { onPageChange: (page: number) => void }) => (
    <nav data-testid="pagination">
      <button type="button" data-testid="go-page-2" onClick={() => onPageChange(2)} />
    </nav>
  ),
}));

vi.mock("@/components/admin/refresh-interval-select", () => ({
  RefreshIntervalSelect: () => <div data-testid="refresh-select" />,
}));

vi.mock("@/components/admin/topbar", () => ({
  Topbar: ({ title }: { title: string }) => <div>{title}</div>,
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
  }) => {
    if (asChild) return <>{children}</>;
    return <button type="button">{children}</button>;
  },
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock("@/components/ui/table", () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
}));

vi.mock("lucide-react", () => ({
  ScrollText: () => <svg />,
  X: () => <svg />,
}));

function setFocusParam(value: string | null) {
  useSearchParamsMock.mockReturnValue({
    get: (key: string) => (key === "focus" ? value : null),
  });
}

describe("LogsPage focus query param", () => {
  beforeEach(() => {
    useSearchParamsMock.mockReset();
    useRequestLogsMock.mockReset();
    useRequestLogLiveMock.mockReset();
    lastLogsTableProps = null;
    useRequestLogLiveMock.mockReturnValue({
      connectionState: "fallback",
      fallbackRefetchIntervalMs: 5000,
    });
  });

  it("renders the standard management header when no focus param is present", () => {
    setFocusParam(null);
    useRequestLogsMock.mockReturnValueOnce({
      isLoading: false,
      data: { items: [], total: 0, total_pages: 1, page: 1, page_size: 20 },
      refetch: vi.fn(),
    });

    render(<LogsPage />);

    expect(screen.getByText("logs.management")).toBeInTheDocument();
    expect(screen.queryByText("logs.focusActive")).not.toBeInTheDocument();
  });

  it("shows focus banner and forwards id filter + initial expanded ID when focus hits", () => {
    setFocusParam("log-1");
    useRequestLogsMock.mockReturnValueOnce({
      isLoading: false,
      data: { items: [{ id: "log-1" }], total: 1, total_pages: 1, page: 1, page_size: 1 },
      refetch: vi.fn(),
    });

    render(<LogsPage />);

    expect(useRequestLogsMock).toHaveBeenCalledWith(
      1,
      1,
      { id: "log-1" },
      expect.objectContaining({ refetchInterval: false })
    );

    expect(screen.getByText("logs.focusActive")).toBeInTheDocument();
    expect(screen.getByText("log-1")).toBeInTheDocument();
    const table = screen.getByTestId("logs-table");
    expect(table.getAttribute("data-log-count")).toBe("1");
    expect(table.getAttribute("data-initial-expanded")).toBe("log-1");

    const clearLink = screen.getByRole("link", { name: /logs.focusClear/i });
    expect(clearLink).toHaveAttribute("href", "/logs");
  });

  it("shows 'not found' banner when focus param does not match any log", () => {
    setFocusParam("missing");
    useRequestLogsMock.mockReturnValueOnce({
      isLoading: false,
      data: { items: [], total: 0, total_pages: 1, page: 1, page_size: 1 },
      refetch: vi.fn(),
    });

    render(<LogsPage />);

    expect(screen.getByText("logs.focusNotFound")).toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();
  });

  it("shows user filter banner and forwards user_id filter when user_id param hits", () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => (key === "user_id" ? "user-42" : null),
    });
    useRequestLogsMock.mockReturnValueOnce({
      isLoading: false,
      data: { items: [{ id: "log-1" }], total: 1, total_pages: 1, page: 1, page_size: 20 },
      refetch: vi.fn(),
    });

    render(<LogsPage />);

    expect(useRequestLogsMock).toHaveBeenCalledWith(
      1,
      20,
      { user_id: "user-42", time_range: "30d" },
      expect.objectContaining({ refetchInterval: 5000 })
    );

    expect(screen.getByText("logs.userFilterActive")).toBeInTheDocument();
    expect(screen.getByText("user-42")).toBeInTheDocument();
    // Management header still renders alongside the filter banner.
    expect(screen.getByText("logs.management")).toBeInTheDocument();

    const clearLink = screen.getByRole("link", { name: /logs.userFilterClear/i });
    expect(clearLink).toHaveAttribute("href", "/logs");
  });

  it("ignores user_id filter when focus param is also present", () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === "focus") return "log-1";
        if (key === "user_id") return "user-42";
        return null;
      },
    });
    useRequestLogsMock.mockReturnValueOnce({
      isLoading: false,
      data: { items: [{ id: "log-1" }], total: 1, total_pages: 1, page: 1, page_size: 1 },
      refetch: vi.fn(),
    });

    render(<LogsPage />);

    expect(useRequestLogsMock).toHaveBeenCalledWith(
      1,
      1,
      { id: "log-1" },
      expect.objectContaining({ refetchInterval: false })
    );
    expect(screen.queryByText("logs.userFilterActive")).not.toBeInTheDocument();
  });
});

describe("LogsPage server filter mapping", () => {
  beforeEach(() => {
    useSearchParamsMock.mockReset();
    useRequestLogsMock.mockReset();
    useRequestLogLiveMock.mockReset();
    lastLogsTableProps = null;
    useRequestLogLiveMock.mockReturnValue({
      connectionState: "fallback",
      fallbackRefetchIntervalMs: 5000,
    });
    setFocusParam(null);
    useRequestLogsMock.mockReturnValue({
      isLoading: false,
      data: { items: [], total: 60, total_pages: 3, page: 1, page_size: 20 },
      refetch: vi.fn(),
    });
  });

  function lastFilters() {
    const call = useRequestLogsMock.mock.calls.at(-1)!;
    return { page: call[0] as number, filters: call[2] as Record<string, unknown> };
  }

  function patchFilters(patch: Record<string, unknown>) {
    act(() => {
      lastLogsTableProps?.onServerFiltersChange?.(patch);
    });
  }

  it("maps performance presets to threshold params and resets the page", () => {
    render(<LogsPage />);
    fireEvent.click(screen.getByTestId("go-page-2"));
    expect(lastFilters().page).toBe(2);

    patchFilters({ perfPreset: "high_ttft" });
    expect(lastFilters()).toEqual({ page: 1, filters: { ttft_min_ms: 5000, time_range: "30d" } });

    patchFilters({ perfPreset: "low_tps" });
    expect(lastFilters().filters).toEqual({ tps_max: 30, time_range: "30d" });

    patchFilters({ perfPreset: "slow_duration" });
    expect(lastFilters().filters).toEqual({ duration_min_ms: 20000, time_range: "30d" });
  });

  it("sends start_time/end_time instead of time_range for a custom range", () => {
    render(<LogsPage />);
    patchFilters({
      timeRange: "custom",
      customRange: { startIso: "2026-07-01T00:00:00.000Z", endIso: "2026-07-08T00:00:00.000Z" },
    });
    expect(lastFilters().filters).toEqual({
      start_time: "2026-07-01T00:00:00.000Z",
      end_time: "2026-07-08T00:00:00.000Z",
    });
  });

  it("prefers the exact status code over the status class", () => {
    render(<LogsPage />);
    patchFilters({ statusClass: "5xx", statusCode: "429" });
    expect(lastFilters().filters).toEqual({ status_code: 429, time_range: "30d" });

    patchFilters({ statusCode: "" });
    expect(lastFilters().filters).toEqual({ status_class: "5xx", time_range: "30d" });
  });

  it("maps upstream/key selections and sort state to query params", () => {
    render(<LogsPage />);
    patchFilters({ upstreamId: "up-1", apiKeyId: "key-1", sortField: "cost", sortOrder: "asc" });
    expect(lastFilters().filters).toEqual({
      upstream_id: "up-1",
      api_key_id: "key-1",
      time_range: "30d",
      sort: "cost",
      order: "asc",
    });
  });

  it("passes admin filter options to the table and withholds them in focus view", () => {
    render(<LogsPage />);
    expect(lastLogsTableProps?.upstreamFilterOptions).toEqual([
      { id: "up-1", name: "Upstream One" },
    ]);
    expect(lastLogsTableProps?.apiKeyFilterOptions).toEqual([{ id: "key-1", name: "Key One" }]);
  });

  it("withholds filter options and server filters in focus view", () => {
    setFocusParam("log-1");
    useRequestLogsMock.mockReturnValue({
      isLoading: false,
      data: { items: [{ id: "log-1" }], total: 1, total_pages: 1, page: 1, page_size: 1 },
      refetch: vi.fn(),
    });

    render(<LogsPage />);

    expect(lastLogsTableProps?.upstreamFilterOptions).toBeUndefined();
    expect(lastLogsTableProps?.apiKeyFilterOptions).toBeUndefined();
    expect(lastLogsTableProps?.onServerFiltersChange).toBeUndefined();
  });
});
