import { render, screen } from "@testing-library/react";
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

vi.mock("@/components/admin/logs-table", () => ({
  DEFAULT_LOGS_SERVER_FILTERS: { statusClass: "all", model: "", timeRange: "30d" },
  LogsTable: ({
    logs,
    initialExpandedIds,
  }: {
    logs: Array<{ id: string }>;
    isLive?: boolean;
    initialExpandedIds?: readonly string[];
  }) => (
    <div
      data-testid="logs-table"
      data-log-count={logs.length}
      data-initial-expanded={(initialExpandedIds ?? []).join(",")}
    />
  ),
}));

vi.mock("@/components/admin/pagination-controls", () => ({
  PaginationControls: () => <nav data-testid="pagination" />,
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
