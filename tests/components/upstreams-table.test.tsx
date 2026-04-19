import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpstreamsTable } from "@/components/admin/upstreams-table";
import UpstreamsPage from "@/app/[locale]/(dashboard)/upstreams/page";
import type { Upstream } from "@/types/api";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (!values) return key;
    return `${key} ${JSON.stringify(values)}`;
  },
  useLocale: () => "en",
}));

vi.mock("@/lib/date-locale", () => ({
  getDateLocale: () => undefined,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockToggleUpstreamActive = vi.fn();
let mockUpstreamQuotaData: unknown = undefined;
const mockUseUpstreams = vi.fn();
const mockUseAllUpstreams = vi.fn();
const mockUseUpstreamHealth = vi.fn();
const mockUseTestUpstream = vi.fn();
vi.mock("@/hooks/use-upstreams", () => ({
  useToggleUpstreamActive: () => ({
    mutateAsync: mockToggleUpstreamActive,
    isPending: false,
    variables: undefined,
  }),
  useUpstreamQuota: () => ({
    data: mockUpstreamQuotaData,
    isLoading: false,
  }),
  useUpstreams: (...args: unknown[]) => mockUseUpstreams(...args),
  useAllUpstreams: (...args: unknown[]) => mockUseAllUpstreams(...args),
  useUpstreamHealth: (...args: unknown[]) => mockUseUpstreamHealth(...args),
  useTestUpstream: (...args: unknown[]) => mockUseTestUpstream(...args),
}));

vi.mock("@/components/admin/topbar", () => ({
  Topbar: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/components/admin/upstream-form-dialog", () => ({
  UpstreamFormDialog: () => null,
}));

vi.mock("@/components/admin/delete-upstream-dialog", () => ({
  DeleteUpstreamDialog: () => null,
}));

vi.mock("@/components/admin/test-upstream-dialog", () => ({
  TestUpstreamDialog: () => null,
}));

const mockForceCircuitBreaker = vi.fn();
vi.mock("@/hooks/use-circuit-breaker", () => ({
  useForceCircuitBreaker: () => ({
    mutateAsync: mockForceCircuitBreaker,
    isPending: false,
    variables: undefined,
  }),
}));

describe("UpstreamsTable", () => {
  const baseUpstream: Upstream = {
    id: "upstream-1",
    name: "OpenAI Main",
    base_url: "https://api.openai.com/v1",
    official_website_url: null,
    api_key_masked: "sk-***1234",
    is_default: false,
    timeout: 60,
    is_active: true,
    description: "primary",
    weight: 1,
    priority: 0,
    current_concurrency: 1,
    max_concurrency: 10,
    route_capabilities: ["openai_chat_compatible"],
    allowed_models: null,
    model_redirects: null,
    model_discovery: {
      mode: "openai_compatible",
      custom_endpoint: null,
      enable_lite_llm_fallback: false,
    },
    model_catalog: [{ model: "gpt-4.1", source: "native" }],
    model_catalog_updated_at: new Date().toISOString(),
    model_catalog_last_status: "success",
    model_catalog_last_error: null,
    model_catalog_last_failed_at: null,
    model_rules: null,
    health_status: {
      upstream_id: "upstream-1",
      is_healthy: true,
      last_check_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      failure_count: 0,
      latency_ms: 120,
      error_message: null,
    },
    circuit_breaker: {
      state: "closed",
      failure_count: 0,
      success_count: 0,
      last_failure_at: null,
      opened_at: null,
      config: null,
    },
    affinity_migration: null,
    last_used_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onTest = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpstreamQuotaData = undefined;
  });

  it("renders empty state", () => {
    render(<UpstreamsTable upstreams={[]} onEdit={onEdit} onDelete={onDelete} onTest={onTest} />);

    expect(screen.getByText("noUpstreams")).toBeInTheDocument();
    expect(screen.getByText("noUpstreamsDesc")).toBeInTheDocument();
  });

  it("renders filtered empty state when filters are active", () => {
    render(
      <UpstreamsTable
        upstreams={[]}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
        hasActiveFilters={true}
      />
    );

    expect(screen.getByText("noFilteredUpstreams")).toBeInTheDocument();
    expect(screen.getByText("noFilteredUpstreamsDesc")).toBeInTheDocument();
  });

  it("renders tier workbench card and upstream basics", () => {
    render(
      <UpstreamsTable
        upstreams={[baseUpstream]}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
      />
    );

    expect(screen.getByText("tier P0")).toBeInTheDocument();
    expect(screen.getByText("OpenAI Main")).toBeInTheDocument();
    expect(screen.getByText("https://api.openai.com/v1")).toBeInTheDocument();
    expect(screen.getByText("runtimeStatus")).toBeInTheDocument();
  });

  it("renders queue policy summary in runtime status", () => {
    render(
      <UpstreamsTable
        upstreams={[
          {
            ...baseUpstream,
            queue_policy: {
              enabled: true,
              timeout_ms: 45000,
              max_queue_length: 8,
            },
          },
        ]}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
      />
    );

    expect(screen.getByText(/queuePolicyStatus/)).toBeInTheDocument();
    expect(screen.getByText(/queuePolicyRuntimeSummary/)).toBeInTheDocument();
  });

  it("shows a lightweight catalog signal when cached catalog data exists", () => {
    render(
      <UpstreamsTable
        upstreams={[baseUpstream]}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
      />
    );

    expect(screen.getByText("catalogSignalReady")).toBeInTheDocument();
  });

  it("sorts tiers by priority and renders degraded/offline tier led labels", () => {
    const healthyInP0: Upstream = {
      ...baseUpstream,
      id: "p0-healthy",
      priority: 0,
      health_status: {
        upstream_id: "p0-healthy",
        is_healthy: true,
        last_check_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
        failure_count: 0,
        latency_ms: 100,
        error_message: null,
      },
    };
    const unhealthyInP0: Upstream = {
      ...baseUpstream,
      id: "p0-unhealthy",
      priority: 0,
      health_status: {
        upstream_id: "p0-unhealthy",
        is_healthy: false,
        last_check_at: new Date().toISOString(),
        last_success_at: null,
        failure_count: 2,
        latency_ms: null,
        error_message: "timeout",
      },
    };
    const unhealthyInP5: Upstream = {
      ...baseUpstream,
      id: "p5-unhealthy",
      priority: 5,
      health_status: {
        upstream_id: "p5-unhealthy",
        is_healthy: false,
        last_check_at: new Date().toISOString(),
        last_success_at: null,
        failure_count: 3,
        latency_ms: null,
        error_message: "timeout",
      },
    };

    render(
      <UpstreamsTable
        upstreams={[unhealthyInP5, healthyInP0, unhealthyInP0]}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
      />
    );

    const tierP0 = screen.getByText("tier P0");
    const tierP5 = screen.getByText("tier P5");
    expect(tierP0.compareDocumentPosition(tierP5) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("tierLedDegraded")).toBeInTheDocument();
    expect(screen.getByText("tierLedOffline")).toBeInTheDocument();
  });

  it("supports collapsing and expanding a tier", async () => {
    render(
      <UpstreamsTable
        upstreams={[baseUpstream]}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
      />
    );

    const tierToggle = screen.getByRole("button", { name: /collapse/i });
    fireEvent.click(tierToggle);
    await waitFor(() => {
      expect(screen.queryByText("OpenAI Main")).not.toBeInTheDocument();
    });

    const expandToggle = screen.getByRole("button", { name: /expand/i });
    fireEvent.click(expandToggle);
    expect(screen.getByText("OpenAI Main")).toBeInTheDocument();
  });

  it("calls toggle mutation when active switch changes", async () => {
    mockToggleUpstreamActive.mockResolvedValueOnce(undefined);

    render(
      <UpstreamsTable
        upstreams={[baseUpstream]}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
      />
    );

    fireEvent.click(screen.getByLabelText("quickDisable: OpenAI Main"));

    await waitFor(() => {
      expect(mockToggleUpstreamActive).toHaveBeenCalledWith({
        id: "upstream-1",
        nextActive: false,
      });
    });
  });

  it("hides test action and keeps edit action", () => {
    render(
      <UpstreamsTable
        upstreams={[baseUpstream]}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
      />
    );

    fireEvent.click(screen.getByLabelText("edit: OpenAI Main"));

    expect(screen.queryByLabelText("test: OpenAI Main")).not.toBeInTheDocument();
    expect(onTest).not.toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalledWith(baseUpstream);
  });

  it("supports delete action directly", async () => {
    render(
      <UpstreamsTable
        upstreams={[baseUpstream]}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
      />
    );

    fireEvent.click(screen.getByLabelText("delete: OpenAI Main"));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(baseUpstream);
    });
  });

  it("shows circuit recover action when circuit is open", async () => {
    mockForceCircuitBreaker.mockResolvedValueOnce(undefined);
    const openCircuitUpstream: Upstream = {
      ...baseUpstream,
      circuit_breaker: {
        state: "open",
        failure_count: 2,
        success_count: 0,
        last_failure_at: null,
        opened_at: null,
        config: null,
      },
    };

    render(
      <UpstreamsTable
        upstreams={[openCircuitUpstream]}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
      />
    );

    fireEvent.click(screen.getByLabelText("recoverCircuitBreaker: OpenAI Main"));

    await waitFor(() => {
      expect(mockForceCircuitBreaker).toHaveBeenCalledWith({
        upstreamId: "upstream-1",
        action: "close",
      });
    });
  });

  it("shows official website link when configured", () => {
    const withWebsite: Upstream = {
      ...baseUpstream,
      official_website_url: "https://platform.openai.com",
    };

    render(
      <UpstreamsTable
        upstreams={[withWebsite]}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
      />
    );

    const links = screen.getAllByRole("link", { name: /officialWebsiteAction/i });
    expect(links.length).toBeGreaterThan(0);
  });

  it("highlights concurrency full status", () => {
    const full: Upstream = {
      ...baseUpstream,
      current_concurrency: 10,
      max_concurrency: 10,
    };

    render(
      <UpstreamsTable upstreams={[full]} onEdit={onEdit} onDelete={onDelete} onTest={onTest} />
    );

    expect(screen.getByText("concurrencyFullStatus")).toBeInTheDocument();
  });

  it("uses last_used_at and shows neverUsed for idle upstream", () => {
    const neverUsed: Upstream = {
      ...baseUpstream,
      last_used_at: null,
    };

    render(
      <UpstreamsTable upstreams={[neverUsed]} onEdit={onEdit} onDelete={onDelete} onTest={onTest} />
    );

    expect(screen.getByText("lastUsed:")).toBeInTheDocument();
    expect(screen.getByText("neverUsed")).toBeInTheDocument();
    expect(screen.queryByText("createdAt")).not.toBeInTheDocument();
  });

  it("renders quota block with timing hints", () => {
    mockUpstreamQuotaData = {
      items: [
        {
          upstream_id: "upstream-1",
          upstream_name: "OpenAI Main",
          is_exceeded: true,
          rules: [
            {
              period_type: "daily",
              period_hours: null,
              current_spending: 10,
              spending_limit: 10,
              percent_used: 100,
              is_exceeded: true,
              resets_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
              estimated_recovery_at: null,
            },
            {
              period_type: "rolling",
              period_hours: 24,
              current_spending: 12,
              spending_limit: 10,
              percent_used: 120,
              is_exceeded: true,
              resets_at: null,
              estimated_recovery_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            },
          ],
        },
      ],
    };

    render(
      <UpstreamsTable
        upstreams={[baseUpstream]}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
      />
    );

    expect(screen.getByText("tableQuota")).toBeInTheDocument();
    expect(screen.getByText(/quotaResets:/)).toBeInTheDocument();
    expect(screen.getByText(/quotaRecovery:/)).toBeInTheDocument();
  });

  it("collapses quota details in compact density until expanded", () => {
    mockUpstreamQuotaData = {
      items: [
        {
          upstream_id: "upstream-1",
          upstream_name: "OpenAI Main",
          is_exceeded: false,
          rules: [
            {
              period_type: "daily",
              period_hours: null,
              current_spending: 3,
              spending_limit: 10,
              percent_used: 30,
              is_exceeded: false,
              resets_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
              estimated_recovery_at: null,
            },
          ],
        },
      ],
    };

    render(
      <UpstreamsTable
        upstreams={[baseUpstream]}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
        density="compact"
      />
    );

    const quotaSummary = screen.getByText("showQuotaDetails");
    const details = quotaSummary.closest("details");

    expect(quotaSummary).toBeInTheDocument();
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute("open");

    fireEvent.click(quotaSummary);
    expect(details).toHaveAttribute("open");
    expect(screen.getByText(/quotaResets:/)).toBeInTheDocument();
  });

  it("renders capability badge text", () => {
    render(
      <UpstreamsTable
        upstreams={[baseUpstream]}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
      />
    );

    expect(screen.getByText("capabilityOpenAIChatCompatible")).toBeInTheDocument();
  });
});

describe("UpstreamsPage filter-aware empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpstreamQuotaData = undefined;
    mockUseUpstreams.mockReturnValue({
      data: {
        items: [],
        total: 0,
        page: 1,
        page_size: 10,
        total_pages: 1,
      },
      isLoading: false,
    });
    mockUseAllUpstreams.mockReturnValue({
      data: [],
    });
    mockUseUpstreamHealth.mockReturnValue({
      data: {
        data: [],
      },
    });
    mockUseTestUpstream.mockReturnValue({
      mutate: vi.fn(),
      data: null,
      isPending: false,
    });
  });

  it("switches empty-state copy when filters become active and resets back", async () => {
    render(<UpstreamsPage />);

    expect(screen.getByText("noUpstreams")).toBeInTheDocument();
    expect(screen.queryByText("noFilteredUpstreams")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("workbenchSearchPlaceholder"), {
      target: { value: "openai" },
    });

    await waitFor(() => {
      expect(screen.getByText("noFilteredUpstreams")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "resetFilters" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "resetFilters" }));

    await waitFor(() => {
      expect(screen.getByText("noUpstreams")).toBeInTheDocument();
      expect(screen.queryByText("noFilteredUpstreams")).not.toBeInTheDocument();
      expect((screen.getByLabelText("workbenchSearchPlaceholder") as HTMLInputElement).value).toBe(
        ""
      );
    });
  });
});
