import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const listCliproxyLinkedUpstreamsMock = vi.fn();

// Mock admin authorization: the route now calls requireAdmin (the role-aware
// guard) instead of validateAdminAuth. importActual keeps errorResponse and
// getPaginationParams real so response shapes are unchanged; only the gate
// decision is driven by the request token.
vi.mock("@/lib/utils/api-auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/api-auth")>();
  return {
    ...actual,
    requireAdmin: vi.fn(async (request: Request) => {
      const authHeader = request.headers.get("authorization");
      if (authHeader === "Bearer valid-token") {
        return { kind: "admin_token" };
      }
      return actual.errorResponse("Unauthorized", 401);
    }),
  };
});

vi.mock("@/lib/services/cliproxy-linked-upstreams-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/cliproxy-linked-upstreams-service")>();
  return {
    ...actual,
    listCliproxyLinkedUpstreams: (...args: unknown[]) => listCliproxyLinkedUpstreamsMock(...args),
  };
});

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH = "Bearer valid-token";
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

describe("Admin CLIProxyAPI linked upstreams API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未鉴权返回 401", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/linked-upstreams/route");
    const res = await GET(
      new NextRequest("http://localhost/api/admin/cliproxy/instances/instance-1/linked-upstreams", {
        method: "GET",
      }),
      ctx({ id: "instance-1" })
    );
    expect(res.status).toBe(401);
  });

  it("返回上游列表并以 snake_case 命名输出", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/linked-upstreams/route");
    const createdAt = new Date("2025-05-30T12:00:00.000Z");
    listCliproxyLinkedUpstreamsMock.mockResolvedValueOnce([
      {
        id: "up-1",
        name: "Pool Codex",
        provider: "codex",
        kind: "pool",
        authFileName: null,
        isActive: true,
        createdAt,
      },
      {
        id: "up-2",
        name: "Single Claude",
        provider: "anthropic",
        kind: "single",
        authFileName: "claude-a.json",
        isActive: false,
        createdAt,
      },
    ]);

    const res = await GET(
      new NextRequest("http://localhost/api/admin/cliproxy/instances/instance-1/linked-upstreams", {
        method: "GET",
        headers: { authorization: AUTH },
      }),
      ctx({ id: "instance-1" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({
      id: "up-1",
      kind: "pool",
      auth_file_name: null,
      is_active: true,
      created_at: createdAt.toISOString(),
    });
    expect(body.data[1].auth_file_name).toBe("claude-a.json");
  });

  it("实例不存在返回 404", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/linked-upstreams/route");
    const { CliproxyInstanceNotFoundError } = await import("@/lib/services/cliproxy-instance-crud");
    listCliproxyLinkedUpstreamsMock.mockRejectedValueOnce(
      new CliproxyInstanceNotFoundError("missing")
    );

    const res = await GET(
      new NextRequest("http://localhost/api/admin/cliproxy/instances/missing/linked-upstreams", {
        method: "GET",
        headers: { authorization: AUTH },
      }),
      ctx({ id: "missing" })
    );
    expect(res.status).toBe(404);
  });
});
