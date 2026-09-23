import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUsageMock = vi.fn();

vi.mock("@/lib/utils/api-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils/api-auth")>();
  return {
    ...actual,
    requireAdmin: vi.fn(async (request: Request) =>
      request.headers.get("authorization") === "Bearer valid-token"
        ? { kind: "admin_token" }
        : request.headers.get("authorization") === "Bearer member-token"
          ? actual.errorResponse("Forbidden", 403)
          : actual.errorResponse("Unauthorized", 401)
    ),
  };
});
vi.mock("@/lib/services/cliproxy-account-usage-service", () => ({
  getCliproxyAccountUsage: (...args: unknown[]) => getUsageMock(...args),
}));
vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const url = "http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts/usage";
const context = { params: Promise.resolve({ id: "instance-1" }) };

describe("Admin CLIProxyAPI account usage API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("拒绝未鉴权请求且不访问上游", async () => {
    const { GET } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/usage/route");
    const response = await GET(new NextRequest(url), context);
    expect(response.status).toBe(401);
    expect(getUsageMock).not.toHaveBeenCalled();
  });

  it("拒绝普通成员读取管理用量", async () => {
    const { GET } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/usage/route");
    const response = await GET(
      new NextRequest(url, { headers: { authorization: "Bearer member-token" } }),
      context
    );
    expect(response.status).toBe(403);
    expect(getUsageMock).not.toHaveBeenCalled();
  });

  it("返回只读用量快照", async () => {
    const { GET } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/usage/route");
    const data = { fetched_at: "2026-09-23T02:00:00Z", observed_at: null, accounts: [] };
    getUsageMock.mockResolvedValueOnce(data);
    const response = await GET(
      new NextRequest(url, { headers: { authorization: "Bearer valid-token" } }),
      context
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data });
    expect(getUsageMock).toHaveBeenCalledWith("instance-1");
  });

  it("区分实例不存在与上游不可达", async () => {
    const { GET } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/usage/route");
    const { CliproxyInstanceNotFoundError } = await import("@/lib/services/cliproxy-instance-crud");
    const { CliproxyManagementApiError } =
      await import("@/lib/services/cliproxy-management-client");
    const request = new NextRequest(url, { headers: { authorization: "Bearer valid-token" } });
    getUsageMock.mockRejectedValueOnce(new CliproxyInstanceNotFoundError("instance-1"));
    expect((await GET(request, context)).status).toBe(404);
    getUsageMock.mockRejectedValueOnce(
      new CliproxyManagementApiError("unreachable", "upstream gone", null)
    );
    expect((await GET(request, context)).status).toBe(502);
  });
});
