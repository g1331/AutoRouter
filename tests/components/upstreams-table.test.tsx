import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
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

// Edit action navigates to the detail page via the localized Link; the thin
// create dialog uses useRouter to push to the detail page after creation.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

vi.mock("@/components/admin/create-upstream-dialog", () => ({
  CreateUpstreamDialog: () => null,
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

// Rows are collapsed by default; the dense detail block only mounts on expand.
function expandRow(name: string) {
  fireEvent.click(screen.getByText(name));
}

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

  const onDelete = vi.fn();
  const onTest = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpstreamQuotaData = undefined;
  });

  it("renders empty state", () => {
    render(<UpstreamsTable upstreams={[]} onDelete={onDelete} onTest={onTest} />);

    expect(screen.getByText("noUpstreams")).toBeInTheDocument();
    expect(screen.getByText("noUpstreamsDesc")).toBeInTheDocument();
  });

  it("renders filtered empty state when filters are active", () => {
    render(
      <UpstreamsTable upstreams={[]} onDelete={onDelete} onTest={onTest} hasActiveFilters={true} />
    );

    expect(screen.getByText("noFilteredUpstreams")).toBeInTheDocument();
    expect(screen.getByText("noFilteredUpstreamsDesc")).toBeInTheDocument();
  });

  it("renders tier group and compact row basics, revealing runtime status on expand", () => {
    render(<UpstreamsTable upstreams={[baseUpstream]} onDelete={onDelete} onTest={onTest} />);

    expect(screen.getByText("tier P0")).toBeInTheDocument();
    expect(screen.getByText("OpenAI Main")).toBeInTheDocument();
    expect(screen.getByText("https://api.openai.com/v1")).toBeInTheDocument();
    // Dense runtime status only appears once the row is expanded.
    expect(screen.queryByText("runtimeStatus")).not.toBeInTheDocument();

    expandRow("OpenAI Main");
    expect(screen.getByText("runtimeStatus")).toBeInTheDocument();
  });

  it("does not render diagnostic probe result in runtime status", () => {
    render(
      <UpstreamsTable
        upstreams={[
          {
            ...baseUpstream,
            probe_results: [
              {
                id: "probe-1",
                upstream_id: "upstream-1",
                route_capability: "codex_cli_responses",
                client_profile: "codex_cli",
                probe_template_id: "codex_cli_responses_stream_v1",
                probe_kind: "cli_real_request",
                status: "ok",
                layer: "business",
                success: true,
                latency_ms: 88,
                first_byte_latency_ms: 40,
                completed_latency_ms: 88,
                status_code: 200,
                error_type: null,
                error_message: null,
                response_body: "event: response.completed",
                probe_url: "https://api.openai.com/v1/responses",
                model: "gpt-5.4-mini",
                checked_at: new Date().toISOString(),
              },
            ],
          },
        ]}
        onDelete={onDelete}
        onTest={onTest}
      />
    );

    expect(screen.queryByText("probeStatus.ok · 88ms")).not.toBeInTheDocument();
    expect(screen.queryByText("codex_cli / codex_cli_responses")).not.toBeInTheDocument();
    // Runtime label is present inline (screen-reader text) even while collapsed.
    expect(screen.getByText("runtimeAvailable")).toBeInTheDocument();
  });

  it("renders queue policy summary in expanded runtime status", () => {
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
        onDelete={onDelete}
        onTest={onTest}
      />
    );

    expandRow("OpenAI Main");
    expect(screen.getByText(/queuePolicyStatus/)).toBeInTheDocument();
    expect(screen.getByText(/queuePolicyRuntimeSummary/)).toBeInTheDocument();
  });

  it("shows a lightweight catalog signal in the expanded row", () => {
    render(<UpstreamsTable upstreams={[baseUpstream]} onDelete={onDelete} onTest={onTest} />);

    expandRow("OpenAI Main");
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
      circuit_breaker: {
        upstream_id: "p0-unhealthy",
        state: "open",
        failure_count: 2,
        success_count: 0,
        next_attempt_at: null,
        last_failure_at: new Date().toISOString(),
        last_success_at: null,
      },
    };
    const unhealthyInP5: Upstream = {
      ...baseUpstream,
      id: "p5-unhealthy",
      priority: 5,
      is_active: false,
    };

    render(
      <UpstreamsTable
        upstreams={[unhealthyInP5, healthyInP0, unhealthyInP0]}
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
    render(<UpstreamsTable upstreams={[baseUpstream]} onDelete={onDelete} onTest={onTest} />);

    const tierToggle = screen.getByRole("button", { name: /collapse/i });
    fireEvent.click(tierToggle);
    await waitFor(() => {
      expect(screen.queryByText("OpenAI Main")).not.toBeInTheDocument();
    });

    const expandToggle = screen.getByRole("button", { name: /expand/i });
    fireEvent.click(expandToggle);
    expect(screen.getByText("OpenAI Main")).toBeInTheDocument();
  });

  it("keeps expanded tier content unconstrained so long mobile lists are not clipped", () => {
    const { container } = render(
      <UpstreamsTable upstreams={[baseUpstream]} onDelete={onDelete} onTest={onTest} />
    );

    const expandedTier = container.querySelector('[data-state="open"]');

    expect(expandedTier).toBeInTheDocument();
    expect(expandedTier?.className).toContain("max-h-none");
    expect(expandedTier?.className).toContain("overflow-visible");
    expect(expandedTier?.className).not.toContain("max-h-[2400px]");
  });

  it("calls toggle mutation when active switch changes", async () => {
    mockToggleUpstreamActive.mockResolvedValueOnce(undefined);

    render(<UpstreamsTable upstreams={[baseUpstream]} onDelete={onDelete} onTest={onTest} />);

    fireEvent.click(screen.getByLabelText("quickDisable: OpenAI Main"));

    await waitFor(() => {
      expect(mockToggleUpstreamActive).toHaveBeenCalledWith({
        id: "upstream-1",
        nextActive: false,
      });
    });
  });

  it("invokes onTest from the row test action and links edit to the detail page", () => {
    render(<UpstreamsTable upstreams={[baseUpstream]} onDelete={onDelete} onTest={onTest} />);

    fireEvent.click(screen.getByLabelText("testUpstream: OpenAI Main"));
    expect(onTest).toHaveBeenCalledWith(baseUpstream);

    const editLink = screen.getByLabelText("edit: OpenAI Main");
    expect(editLink).toHaveAttribute("href", "/upstreams/upstream-1");
  });

  it("supports delete action directly and anchors the morph source to the row", async () => {
    render(<UpstreamsTable upstreams={[baseUpstream]} onDelete={onDelete} onTest={onTest} />);

    fireEvent.click(screen.getByLabelText("delete: OpenAI Main"));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(baseUpstream, expect.any(HTMLElement));
    });
    // 删除确认弹窗从行容器变形展开
    const [, deleteSource] = onDelete.mock.calls[0];
    expect(deleteSource).toHaveAttribute("data-morph-source");
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
      <UpstreamsTable upstreams={[openCircuitUpstream]} onDelete={onDelete} onTest={onTest} />
    );

    fireEvent.click(screen.getByLabelText("recoverCircuitBreaker: OpenAI Main"));

    await waitFor(() => {
      expect(mockForceCircuitBreaker).toHaveBeenCalledWith({
        upstreamId: "upstream-1",
        action: "close",
      });
    });
  });

  it("shows official website link in the expanded row when configured", () => {
    const withWebsite: Upstream = {
      ...baseUpstream,
      official_website_url: "https://platform.openai.com",
    };

    render(<UpstreamsTable upstreams={[withWebsite]} onDelete={onDelete} onTest={onTest} />);

    expandRow("OpenAI Main");
    const links = screen.getAllByRole("link", { name: /officialWebsiteAction/i });
    expect(links.length).toBeGreaterThan(0);
  });

  it("highlights concurrency full status", () => {
    const full: Upstream = {
      ...baseUpstream,
      current_concurrency: 10,
      max_concurrency: 10,
    };

    render(<UpstreamsTable upstreams={[full]} onDelete={onDelete} onTest={onTest} />);

    // Runtime label surfaces the concurrency-full state inline.
    expect(screen.getAllByText("concurrencyFullStatus").length).toBeGreaterThanOrEqual(1);
  });

  it("uses last_used_at and shows neverUsed for idle upstream", () => {
    const neverUsed: Upstream = {
      ...baseUpstream,
      last_used_at: null,
    };

    render(<UpstreamsTable upstreams={[neverUsed]} onDelete={onDelete} onTest={onTest} />);

    // Last-used relative time is always visible inline, even collapsed.
    expect(screen.getByText("neverUsed")).toBeInTheDocument();
    expect(screen.queryByText("createdAt")).not.toBeInTheDocument();
  });

  it("renders quota block with timing hints in the expanded row", () => {
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

    render(<UpstreamsTable upstreams={[baseUpstream]} onDelete={onDelete} onTest={onTest} />);

    expandRow("OpenAI Main");
    expect(screen.getByText("tableQuota")).toBeInTheDocument();
    expect(screen.getByText(/quotaResets:/)).toBeInTheDocument();
    expect(screen.getByText(/quotaRecovery:/)).toBeInTheDocument();
  });

  it("hides quota rule detail until the row is expanded", () => {
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
        onDelete={onDelete}
        onTest={onTest}
        density="compact"
      />
    );

    expect(screen.queryByText(/quotaResets:/)).not.toBeInTheDocument();

    expandRow("OpenAI Main");
    expect(screen.getByText("tableQuota")).toBeInTheDocument();
    expect(screen.getByText(/quotaResets:/)).toBeInTheDocument();
  });

  it("renders capability badge text in the expanded row", () => {
    render(<UpstreamsTable upstreams={[baseUpstream]} onDelete={onDelete} onTest={onTest} />);

    expandRow("OpenAI Main");
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
