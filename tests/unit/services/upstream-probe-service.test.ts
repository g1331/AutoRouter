import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type InsertValues = Record<string, unknown>;
type UpdateValues = Record<string, unknown>;

const mockFindUpstream = vi.fn();
const mockFindProbeResult = vi.fn();
const mockInsertValues = vi.fn();
const mockUpdateSet = vi.fn();
const mockGetDecryptedApiKey = vi.fn();
const mockIsUrlSafe = vi.fn();
const mockResolveAndValidateHostname = vi.fn();

let lastInsertedValues: InsertValues | null = null;
let lastUpdatedValues: UpdateValues | null = null;

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
  desc: vi.fn((column: unknown) => ({ type: "desc", column })),
  eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreams: {
        findFirst: mockFindUpstream,
      },
      upstreamProbeResults: {
        findFirst: mockFindProbeResult,
        findMany: vi.fn(() => Promise.resolve([])),
      },
    },
    insert: vi.fn(() => ({
      values: mockInsertValues,
    })),
    update: vi.fn(() => ({
      set: mockUpdateSet,
    })),
  },
  upstreams: {
    id: "upstreams.id",
  },
  upstreamProbeResults: {
    upstreamId: "upstream_probe_results.upstream_id",
    routeCapability: "upstream_probe_results.route_capability",
    clientProfile: "upstream_probe_results.client_profile",
    probeTemplateId: "upstream_probe_results.probe_template_id",
    id: "upstream_probe_results.id",
    checkedAt: "upstream_probe_results.checked_at",
  },
}));

vi.mock("@/lib/services/upstream-crud", () => ({
  getDecryptedApiKey: mockGetDecryptedApiKey,
  UpstreamNotFoundError: class UpstreamNotFoundError extends Error {},
}));

vi.mock("@/lib/services/upstream-ssrf-validator", () => ({
  isUrlSafe: mockIsUrlSafe,
  resolveAndValidateHostname: mockResolveAndValidateHostname,
}));

function createMockUpstream(overrides: Record<string, unknown> = {}) {
  return {
    id: "upstream-1",
    name: "Probe Upstream",
    baseUrl: "https://api.openai.com/v1",
    routeCapabilities: ["codex_cli_responses"],
    timeout: 10,
    ...overrides,
  };
}

function createProbeRecord(
  values: InsertValues | UpdateValues,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "probe-1",
    upstreamId: "upstream-1",
    routeCapability: values.routeCapability,
    clientProfile: values.clientProfile,
    probeTemplateId: values.probeTemplateId,
    probeKind: values.probeKind,
    status: values.status,
    layer: values.layer,
    success: values.success,
    latencyMs: values.latencyMs,
    firstByteLatencyMs: values.firstByteLatencyMs,
    completedLatencyMs: values.completedLatencyMs,
    statusCode: values.statusCode,
    errorType: values.errorType,
    errorMessage: values.errorMessage,
    responseBody: values.responseBody,
    probeUrl: values.probeUrl,
    model: values.model,
    checkedAt:
      values.checkedAt instanceof Date ? values.checkedAt : new Date("2026-05-01T00:00:00.000Z"),
    createdAt:
      values.createdAt instanceof Date ? values.createdAt : new Date("2026-05-01T00:00:00.000Z"),
    updatedAt:
      values.updatedAt instanceof Date ? values.updatedAt : new Date("2026-05-01T00:00:00.000Z"),
    ...overrides,
  };
}

function createSseResponse(events: string[], status = 200): Response {
  const body = events.map((event) => `event: ${event}\ndata: {}\n\n`).join("");
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function createSseTextResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("upstream-probe-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastInsertedValues = null;
    lastUpdatedValues = null;
    mockFindUpstream.mockResolvedValue(createMockUpstream());
    mockFindProbeResult.mockResolvedValue(null);
    mockGetDecryptedApiKey.mockReturnValue("sk-probe");
    mockIsUrlSafe.mockReturnValue({ safe: true });
    mockResolveAndValidateHostname.mockResolvedValue({ safe: true });
    mockInsertValues.mockImplementation((values: InsertValues) => {
      lastInsertedValues = values;
      return {
        returning: vi.fn().mockResolvedValue([createProbeRecord(values)]),
      };
    });
    mockUpdateSet.mockImplementation((values: UpdateValues) => {
      lastUpdatedValues = values;
      return {
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([createProbeRecord(values)]),
        })),
      };
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createSseResponse(["response.completed"])));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("executes a Codex CLI responses probe with CLI-shaped headers and body", async () => {
    const { executeUpstreamProbe } = await import("@/lib/services/upstream-probe-service");

    const result = await executeUpstreamProbe({ upstreamId: "upstream-1" });
    const fetchMock = vi.mocked(fetch);
    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit?.body as string) as Record<string, unknown>;

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({ method: "POST", redirect: "error" })
    );
    expect(requestInit?.headers).toMatchObject({
      Authorization: "Bearer sk-probe",
      Accept: "text/event-stream",
      originator: "codex_cli_rs",
      "User-Agent": "codex_cli_rs/diagnostic-probe",
      session_id: "autorouter-diagnostic-probe",
      "x-codex-beta-features": "collab",
    });
    expect(requestInit?.headers).toMatchObject({
      "x-codex-turn-metadata": JSON.stringify({ source: "autorouter-diagnostic-probe" }),
    });
    expect(body).toMatchObject({
      model: "gpt-5.4-mini",
      tools: [],
      tool_choice: "auto",
      parallel_tool_calls: false,
      reasoning: null,
      stream: true,
      store: false,
      include: [],
    });
    expect(body.input).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Reply with exactly: OK" }],
      },
    ]);
    expect(result).toMatchObject({
      status: "ok",
      success: true,
      route_capability: "codex_cli_responses",
      client_profile: "codex_cli",
      response_body: expect.stringContaining("response.completed"),
    });
    expect(lastInsertedValues).toMatchObject({
      probeTemplateId: "codex_cli_responses_stream_v1",
      probeKind: "cli_real_request",
      status: "ok",
      success: true,
    });
  });

  it("executes a generic OpenAI responses probe with list-shaped input", async () => {
    mockFindUpstream.mockResolvedValue(
      createMockUpstream({ routeCapabilities: ["openai_responses"] })
    );
    const { executeUpstreamProbe } = await import("@/lib/services/upstream-probe-service");

    const result = await executeUpstreamProbe({
      upstreamId: "upstream-1",
      routeCapability: "openai_responses",
      clientProfile: "generic_openai",
    });
    const [, requestInit] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(requestInit?.body as string) as Record<string, unknown>;

    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({ method: "POST", redirect: "error" })
    );
    expect(body).toMatchObject({
      model: "gpt-5.4-mini",
      max_output_tokens: 8,
      stream: true,
      store: false,
    });
    expect(body.input).toEqual([
      {
        role: "user",
        content: "Reply with exactly: OK",
      },
    ]);
    expect(result).toMatchObject({
      status: "ok",
      success: true,
      route_capability: "openai_responses",
      client_profile: "generic_openai",
      model: "gpt-5.4-mini",
    });
  });

  it("executes a Claude Code messages probe with Anthropic CLI headers and body", async () => {
    mockFindUpstream.mockResolvedValue(
      createMockUpstream({
        baseUrl: "https://api.anthropic.com/v1",
        routeCapabilities: ["claude_code_messages"],
      })
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createSseResponse(["message_stop"])));
    const { executeUpstreamProbe } = await import("@/lib/services/upstream-probe-service");

    const result = await executeUpstreamProbe({
      upstreamId: "upstream-1",
      routeCapability: "claude_code_messages",
      clientProfile: "claude_code",
      model: "claude-custom",
    });
    const [, requestInit] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(requestInit?.body as string) as Record<string, unknown>;

    expect(fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST" })
    );
    expect(requestInit?.headers).toMatchObject({
      "x-api-key": "sk-probe",
      "anthropic-version": "2023-06-01",
      "anthropic-beta":
        "claude-code-20250219,adaptive-thinking-2026-01-28,prompt-caching-scope-2026-01-05,effort-2025-11-24",
      "anthropic-dangerous-direct-browser-access": "true",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Accept-Language": "*",
      "Sec-Fetch-Mode": "cors",
      "X-App": "cli",
      "User-Agent": "claude-cli/diagnostic-probe (external, cli)",
    });
    expect(body).toMatchObject({
      model: "claude-custom",
      max_tokens: 64,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Reply with exactly: OK" }],
        },
      ],
      system: [
        {
          type: "text",
          text: "AutoRouter diagnostic probe. Verify upstream protocol compatibility.",
        },
      ],
      tools: [],
      metadata: { user_id: "autorouter-diagnostic-probe" },
      temperature: 1,
      output_config: { type: "text" },
      stream: true,
    });
    expect(result).toMatchObject({
      status: "ok",
      success: true,
      route_capability: "claude_code_messages",
      client_profile: "claude_code",
    });
  });

  it("classifies HTTP failures and captures upstream response bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"error":"rate limit"}', { status: 429 }))
    );
    const { executeUpstreamProbe } = await import("@/lib/services/upstream-probe-service");

    const result = await executeUpstreamProbe({ upstreamId: "upstream-1" });

    expect(result).toMatchObject({
      status: "rate_limited",
      layer: "business",
      success: false,
      status_code: 429,
      error_type: "rate_limited",
      error_message: '{"error":"rate limit"}',
      response_body: '{"error":"rate limit"}',
    });
  });

  it("classifies SSE failure events as business failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createSseResponse(["response.failed"])));
    const { executeUpstreamProbe } = await import("@/lib/services/upstream-probe-service");

    const result = await executeUpstreamProbe({ upstreamId: "upstream-1" });

    expect(result).toMatchObject({
      status: "business_failed",
      layer: "business",
      success: false,
      error_type: "failure_event",
    });
    expect(result.error_message).toContain("response.failed");
  });

  it("preserves complete long probe response bodies", async () => {
    const longPayload = "x".repeat(12000);
    const responseBody = `event: response.output_text.delta\ndata: ${longPayload}\n\nevent: response.completed\ndata: {}\n\n`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createSseTextResponse(responseBody)));
    const { executeUpstreamProbe } = await import("@/lib/services/upstream-probe-service");

    const result = await executeUpstreamProbe({ upstreamId: "upstream-1" });

    expect(result).toMatchObject({
      status: "ok",
      success: true,
      response_body: responseBody.trim(),
    });
    expect(result.response_body).toContain(longPayload);
    expect(result.response_body).toContain("event: response.completed");
    expect(lastInsertedValues?.responseBody).toBe(responseBody.trim());
  });

  it("classifies incomplete streams as protocol mismatches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createSseResponse(["response.created"])));
    const { executeUpstreamProbe } = await import("@/lib/services/upstream-probe-service");

    const result = await executeUpstreamProbe({ upstreamId: "upstream-1" });

    expect(result).toMatchObject({
      status: "protocol_mismatch",
      layer: "protocol",
      success: false,
      error_type: "stream_incomplete",
    });
  });

  it("persists configuration failures without calling the upstream", async () => {
    mockIsUrlSafe.mockReturnValue({ safe: false, reason: "Loopback addresses are not allowed" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { executeUpstreamProbe } = await import("@/lib/services/upstream-probe-service");

    const result = await executeUpstreamProbe({ upstreamId: "upstream-1" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockGetDecryptedApiKey).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "configuration_error",
      layer: "configuration",
      success: false,
      error_type: "unsafe_url",
      error_message: "Loopback addresses are not allowed",
    });
    expect(lastInsertedValues).toMatchObject({
      status: "configuration_error",
      responseBody: null,
    });
  });

  it("persists router failures when the requested route capability is not enabled", async () => {
    mockFindUpstream.mockResolvedValue(
      createMockUpstream({ routeCapabilities: ["openai_chat_compatible"] })
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { executeUpstreamProbe } = await import("@/lib/services/upstream-probe-service");

    const result = await executeUpstreamProbe({
      upstreamId: "upstream-1",
      routeCapability: "codex_cli_responses",
      clientProfile: "codex_cli",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "route_unavailable",
      layer: "router",
      success: false,
      route_capability: "codex_cli_responses",
      client_profile: "codex_cli",
      probe_template_id: "route_unavailable_codex_cli_responses_codex_cli_v1",
      error_type: "route_capability_unavailable",
    });
    expect(lastInsertedValues).toMatchObject({
      probeKind: "router",
      status: "route_unavailable",
      layer: "router",
    });
  });

  it("persists router failures when no template exists for the selected provider profile", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { executeUpstreamProbe } = await import("@/lib/services/upstream-probe-service");

    const result = await executeUpstreamProbe({
      upstreamId: "upstream-1",
      routeCapability: "codex_cli_responses",
      clientProfile: "generic_openai",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "template_unavailable",
      layer: "router",
      success: false,
      route_capability: "codex_cli_responses",
      client_profile: "generic_openai",
      probe_template_id: "template_unavailable_codex_cli_responses_generic_openai_v1",
      error_type: "probe_template_unavailable",
    });
    expect(lastInsertedValues).toMatchObject({
      probeKind: "router",
      status: "template_unavailable",
      layer: "router",
    });
  });

  it("updates an existing probe identity instead of inserting a duplicate", async () => {
    mockFindProbeResult.mockResolvedValue({ id: "existing-probe" });
    const { executeUpstreamProbe } = await import("@/lib/services/upstream-probe-service");

    await executeUpstreamProbe({ upstreamId: "upstream-1" });

    expect(mockUpdateSet).toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(lastUpdatedValues).toMatchObject({
      routeCapability: "codex_cli_responses",
      clientProfile: "codex_cli",
      probeTemplateId: "codex_cli_responses_stream_v1",
    });
  });
});
