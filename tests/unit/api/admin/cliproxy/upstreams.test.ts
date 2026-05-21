import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const createCliproxyPoolUpstreamMock = vi.fn();
const createCliproxySingleAccountUpstreamMock = vi.fn();

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

vi.mock("@/lib/services/cliproxy-upstream-preset", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/cliproxy-upstream-preset")>();
  return {
    ...actual,
    createCliproxyPoolUpstream: (...args: unknown[]) => createCliproxyPoolUpstreamMock(...args),
    createCliproxySingleAccountUpstream: (...args: unknown[]) =>
      createCliproxySingleAccountUpstreamMock(...args),
  };
});

vi.mock("@/lib/utils/api-transformers", () => ({
  transformUpstreamToApi: (upstream: unknown) => upstream,
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH = "Bearer valid-token";

const sampleUpstream = { id: "upstream-1", name: "CLIProxyAPI Pool" };

function jsonRequest(url: string, method: string, body?: unknown, auth = AUTH): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { authorization: auth, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

describe("Admin CLIProxyAPI upstream API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST pool-upstreams", () => {
    const url = "http://localhost/api/admin/cliproxy/instances/instance-1/pool-upstreams";

    it("未鉴权返回 401", async () => {
      const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/pool-upstreams/route");
      const res = await POST(
        jsonRequest(url, "POST", { provider: "codex" }, "Bearer wrong"),
        ctx({ id: "instance-1" })
      );
      expect(res.status).toBe(401);
      expect(createCliproxyPoolUpstreamMock).not.toHaveBeenCalled();
    });

    it("创建池上游成功返回 201", async () => {
      const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/pool-upstreams/route");
      createCliproxyPoolUpstreamMock.mockResolvedValueOnce(sampleUpstream);

      const res = await POST(
        jsonRequest(url, "POST", { provider: "codex" }),
        ctx({ id: "instance-1" })
      );
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.data).toMatchObject({ id: "upstream-1" });
      expect(createCliproxyPoolUpstreamMock).toHaveBeenCalledWith("instance-1", "codex", {
        name: undefined,
        weight: undefined,
        priority: undefined,
      });
    });

    it("非法服务商返回 400", async () => {
      const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/pool-upstreams/route");
      const res = await POST(
        jsonRequest(url, "POST", { provider: "vertex" }),
        ctx({ id: "instance-1" })
      );
      expect(res.status).toBe(400);
      expect(createCliproxyPoolUpstreamMock).not.toHaveBeenCalled();
    });

    it("实例不存在返回 404", async () => {
      const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/pool-upstreams/route");
      const { CliproxyInstanceNotFoundError } =
        await import("@/lib/services/cliproxy-instance-crud");
      createCliproxyPoolUpstreamMock.mockRejectedValueOnce(
        new CliproxyInstanceNotFoundError("missing")
      );

      const res = await POST(
        jsonRequest(url, "POST", { provider: "codex" }),
        ctx({ id: "missing" })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("POST auth-accounts/:accountName/upstream", () => {
    const url =
      "http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts/codex-a.json/upstream";

    it("未鉴权返回 401", async () => {
      const { POST } =
        await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/upstream/route");
      const res = await POST(
        jsonRequest(url, "POST", {}, "Bearer wrong"),
        ctx({ id: "instance-1", accountName: "codex-a.json" })
      );
      expect(res.status).toBe(401);
      expect(createCliproxySingleAccountUpstreamMock).not.toHaveBeenCalled();
    });

    it("创建单账号上游成功返回 201", async () => {
      const { POST } =
        await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/upstream/route");
      createCliproxySingleAccountUpstreamMock.mockResolvedValueOnce(sampleUpstream);

      const res = await POST(
        jsonRequest(url, "POST", {}),
        ctx({ id: "instance-1", accountName: "codex-a.json" })
      );
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.data).toMatchObject({ id: "upstream-1" });
      expect(createCliproxySingleAccountUpstreamMock).toHaveBeenCalledWith(
        "instance-1",
        "codex-a.json",
        { name: undefined, weight: undefined, priority: undefined, prefix: undefined }
      );
    });

    it("账号不存在返回 404", async () => {
      const { POST } =
        await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/upstream/route");
      const { CliproxyAuthAccountNotFoundError } =
        await import("@/lib/services/cliproxy-auth-account-service");
      createCliproxySingleAccountUpstreamMock.mockRejectedValueOnce(
        new CliproxyAuthAccountNotFoundError("instance-1", "missing.json")
      );

      const res = await POST(
        jsonRequest(url, "POST", {}),
        ctx({ id: "instance-1", accountName: "missing.json" })
      );
      expect(res.status).toBe(404);
    });

    it("实例不存在返回 404", async () => {
      const { POST } =
        await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/upstream/route");
      const { CliproxyInstanceNotFoundError } =
        await import("@/lib/services/cliproxy-instance-crud");
      createCliproxySingleAccountUpstreamMock.mockRejectedValueOnce(
        new CliproxyInstanceNotFoundError("missing")
      );

      const res = await POST(
        jsonRequest(url, "POST", {}),
        ctx({ id: "missing", accountName: "codex-a.json" })
      );
      expect(res.status).toBe(404);
    });
  });
});
