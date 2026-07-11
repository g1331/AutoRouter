import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BasicDiagnosticsSection } from "@/components/admin/upstream/sections/basic-diagnostics-section";
import type { Upstream, UpstreamProbeListResponse, UpstreamProbeResponse } from "@/types/api";

/**
 * Behavior tests for BasicDiagnosticsSection (Phase B2 upstream detail page).
 * Covers: capability/client-profile scoping via PROBE_CAPABILITY_CLIENT_PROFILES
 * (no supported capability disables the run button), running a probe with the
 * derived default capability/client_profile/model, the latestProbe priority
 * chain (mutation data > query data > upstream.probe_results[0]), long-response
 * truncation with an expand toggle, and the copy-to-clipboard action.
 */

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${namespace}.${key}:${JSON.stringify(vars)}` : `${namespace}.${key}`,
}));

const { mockMutateAsync, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockMutateAsync: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

const hookState = {
  executeMutationData: null as UpstreamProbeResponse | null,
  isPending: false,
  queryData: undefined as UpstreamProbeListResponse | undefined,
};

vi.mock("@/hooks/use-upstreams", () => ({
  useExecuteUpstreamProbe: () => ({
    mutateAsync: mockMutateAsync,
    data: hookState.executeMutationData,
    isPending: hookState.isPending,
  }),
  useUpstreamProbes: () => ({ data: hookState.queryData }),
}));

beforeEach(() => {
  mockMutateAsync.mockReset();
  mockMutateAsync.mockResolvedValue(undefined);
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
  hookState.executeMutationData = null;
  hookState.isPending = false;
  hookState.queryData = undefined;
});

function buildUpstream(overrides: Partial<Upstream> = {}): Upstream {
  return {
    id: "upstream-1",
    name: "Test Upstream",
    base_url: "https://api.example.com/v1",
    official_website_url: null,
    description: null,
    api_key_masked: "sk-***1234",
    is_default: false,
    timeout: 60,
    is_active: true,
    current_concurrency: 0,
    max_concurrency: null,
    queue_policy: null,
    failure_rule_config: null,
    weight: 1,
    priority: 0,
    health_status: null,
    probe_results: [],
    circuit_breaker: null,
    route_capabilities: ["codex_cli_responses"],
    allowed_models: null,
    model_redirects: null,
    model_discovery: {
      mode: "openai_compatible",
      custom_endpoint: null,
      enable_lite_llm_fallback: false,
      auto_refresh_enabled: false,
    },
    model_catalog: [],
    model_catalog_updated_at: null,
    model_catalog_last_status: null,
    model_catalog_last_error: null,
    model_catalog_last_failed_at: null,
    model_rules: null,
    affinity_migration: null,
    billing_input_multiplier: 1,
    billing_output_multiplier: 1,
    spending_rules: null,
    last_used_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildProbe(overrides: Partial<UpstreamProbeResponse> = {}): UpstreamProbeResponse {
  return {
    id: "probe-1",
    upstream_id: "upstream-1",
    route_capability: "codex_cli_responses",
    client_profile: "codex_cli",
    probe_template_id: "template-1",
    probe_kind: "chat",
    status: "ok",
    layer: "business",
    success: true,
    latency_ms: 120,
    first_byte_latency_ms: 50,
    completed_latency_ms: 120,
    status_code: 200,
    error_type: null,
    error_message: null,
    response_body: "hello world",
    probe_url: "https://api.example.com/v1/responses",
    model: "gpt-5.4-mini",
    checked_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("BasicDiagnosticsSection", () => {
  it("disables the run button and shows the no-supported-capability message when route_capabilities has none probe-supported", () => {
    const upstream = buildUpstream({ route_capabilities: ["openai_chat_compatible"] });
    render(<BasicDiagnosticsSection upstream={upstream} />);

    expect(screen.getByText("upstreams.probeNoSupportedCapability")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "upstreams.runProbe" })).toBeDisabled();
  });

  it("runs the probe with the derived default capability, client_profile, and model", async () => {
    const upstream = buildUpstream({ route_capabilities: ["codex_cli_responses"] });
    render(<BasicDiagnosticsSection upstream={upstream} />);

    fireEvent.click(screen.getByRole("button", { name: "upstreams.runProbe" }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: upstream.id,
        data: {
          route_capability: "codex_cli_responses",
          client_profile: "codex_cli",
          model: "gpt-5.4-mini",
        },
      })
    );
  });

  it("runs the probe with a manually entered model overriding the derived default", async () => {
    const upstream = buildUpstream({ route_capabilities: ["codex_cli_responses"] });
    render(<BasicDiagnosticsSection upstream={upstream} />);

    fireEvent.change(screen.getByPlaceholderText(/upstreams\.probeModelPlaceholder/), {
      target: { value: "custom-model" },
    });
    fireEvent.click(screen.getByRole("button", { name: "upstreams.runProbe" }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: upstream.id,
        data: {
          route_capability: "codex_cli_responses",
          client_profile: "codex_cli",
          model: "custom-model",
        },
      })
    );
  });

  it("prefers the executed-probe mutation result over the probes query and the upstream prop", () => {
    hookState.executeMutationData = buildProbe({ id: "from-mutation", status: "ok" });
    hookState.queryData = {
      data: [buildProbe({ id: "from-query", status: "rate_limited" })],
      total: 1,
    };
    const upstream = buildUpstream({
      probe_results: [buildProbe({ id: "from-prop", status: "auth_failed" })],
    });
    render(<BasicDiagnosticsSection upstream={upstream} />);

    expect(screen.getByText("upstreams.probeStatus.ok")).toBeInTheDocument();
    expect(screen.queryByText("upstreams.probeStatus.rate_limited")).not.toBeInTheDocument();
    expect(screen.queryByText("upstreams.probeStatus.auth_failed")).not.toBeInTheDocument();
  });

  it("falls back to the probes query result when there is no mutation result yet", () => {
    hookState.queryData = {
      data: [buildProbe({ id: "from-query", status: "rate_limited" })],
      total: 1,
    };
    const upstream = buildUpstream({
      probe_results: [buildProbe({ id: "from-prop", status: "auth_failed" })],
    });
    render(<BasicDiagnosticsSection upstream={upstream} />);

    expect(screen.getByText("upstreams.probeStatus.rate_limited")).toBeInTheDocument();
    expect(screen.queryByText("upstreams.probeStatus.auth_failed")).not.toBeInTheDocument();
  });

  it("falls back to upstream.probe_results[0] when there is no mutation or query result", () => {
    const upstream = buildUpstream({
      probe_results: [buildProbe({ id: "from-prop", status: "auth_failed" })],
    });
    render(<BasicDiagnosticsSection upstream={upstream} />);

    expect(screen.getByText("upstreams.probeStatus.auth_failed")).toBeInTheDocument();
  });

  it("truncates a long response body behind an expand/collapse toggle", () => {
    const longBody = "x".repeat(1601);
    const upstream = buildUpstream({
      probe_results: [buildProbe({ response_body: longBody })],
    });
    const { container } = render(<BasicDiagnosticsSection upstream={upstream} />);
    const getPreText = () => container.querySelector("pre")?.textContent;

    expect(getPreText()).toBe(`${"x".repeat(1600)}\n…`);

    fireEvent.click(screen.getByRole("button", { name: "upstreams.probeExpandResponse" }));

    expect(getPreText()).toBe(longBody);

    fireEvent.click(screen.getByRole("button", { name: "upstreams.probeCollapseResponse" }));

    expect(getPreText()).toBe(`${"x".repeat(1600)}\n…`);
  });

  it("copies the probe response to the clipboard and shows the copied toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const upstream = buildUpstream({
      probe_results: [buildProbe({ response_body: "copy me" })],
    });
    render(<BasicDiagnosticsSection upstream={upstream} />);

    fireEvent.click(screen.getByRole("button", { name: "common.copy" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("copy me"));
    expect(mockToastSuccess).toHaveBeenCalledWith("common.copied");
    expect(screen.getByRole("button", { name: "common.copied" })).toBeInTheDocument();
  });
});
