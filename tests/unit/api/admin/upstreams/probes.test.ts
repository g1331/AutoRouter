import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock admin authorization: the route now calls requireAdmin (the role-aware
// guard) instead of validateAdminAuth. importActual keeps errorResponse and
// other helpers real so response shapes are unchanged; only the gate
// decision is driven by the request token.
vi.mock("@/lib/utils/api-auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/api-auth")>();
  return {
    ...actual,
    requireAdmin: vi.fn(async (request: Request) => {
      const authHeader = request.headers.get("authorization");
      if (authHeader === "Bearer test-admin-token") {
        return { kind: "admin_token" };
      }
      return actual.errorResponse("Unauthorized", 401);
    }),
  };
});

vi.mock("@/lib/services/upstream-service", () => ({
  executeUpstreamProbe: vi.fn(),
  listUpstreamProbeResults: vi.fn(),
  UpstreamNotFoundError: class UpstreamNotFoundError extends Error {},
}));

const sampleProbe = {
  id: "probe-1",
  upstream_id: "upstream-1",
  upstream_name: "Codex CPA",
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
  checked_at: "2026-05-01T00:00:00.000Z",
};

describe("upstream probe admin routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists all upstream probe results", async () => {
    const { listUpstreamProbeResults } = await import("@/lib/services/upstream-service");
    vi.mocked(listUpstreamProbeResults).mockResolvedValueOnce({ data: [sampleProbe], total: 1 });
    const { GET } = await import("@/app/api/admin/upstreams/probes/route");

    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/probes", {
      headers: { authorization: "Bearer test-admin-token" },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [sampleProbe], total: 1 });
    expect(listUpstreamProbeResults).toHaveBeenCalledWith();
  });

  it("executes a real-client upstream probe", async () => {
    const { executeUpstreamProbe } = await import("@/lib/services/upstream-service");
    vi.mocked(executeUpstreamProbe).mockResolvedValueOnce(sampleProbe);
    const { POST } = await import("@/app/api/admin/upstreams/[id]/probes/route");

    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/upstream-1/probes", {
      method: "POST",
      headers: { authorization: "Bearer test-admin-token" },
      body: JSON.stringify({
        route_capability: "codex_cli_responses",
        client_profile: "codex_cli",
        model: "gpt-5.4-mini",
      }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: "upstream-1" }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(sampleProbe);
    expect(executeUpstreamProbe).toHaveBeenCalledWith({
      upstreamId: "upstream-1",
      routeCapability: "codex_cli_responses",
      clientProfile: "codex_cli",
      model: "gpt-5.4-mini",
    });
  });

  it("rejects unauthenticated probe execution", async () => {
    const { POST } = await import("@/app/api/admin/upstreams/[id]/probes/route");
    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/upstream-1/probes", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "upstream-1" }) });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});
