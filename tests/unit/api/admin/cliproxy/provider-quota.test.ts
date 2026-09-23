import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getQuotaMock = vi.fn();

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
vi.mock("@/lib/services/cliproxy-provider-quota-service", () => ({
  getCliproxyProviderQuota: (...args: unknown[]) => getQuotaMock(...args),
}));
vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const url =
  "http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts/codex.json/provider-quota";
const context = { params: Promise.resolve({ id: "instance-1", accountName: "codex.json" }) };

describe("Admin CLIProxyAPI provider quota API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("拒绝未鉴权和普通成员访问", async () => {
    const { GET } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/provider-quota/route");
    expect((await GET(new NextRequest(url), context)).status).toBe(401);
    expect(
      (
        await GET(
          new NextRequest(url, { headers: { authorization: "Bearer member-token" } }),
          context
        )
      ).status
    ).toBe(403);
    expect(getQuotaMock).not.toHaveBeenCalled();
  });

  it("返回指定账号的只读额度投影", async () => {
    const { GET } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/provider-quota/route");
    const data = {
      provider: "codex",
      status: "ready",
      reason: null,
      fetched_at: "2026-09-23T00:00:00Z",
      windows: [{ id: "primary", remaining_percent: 75, resets_at: null }],
    };
    getQuotaMock.mockResolvedValueOnce(data);
    const response = await GET(
      new NextRequest(url, { headers: { authorization: "Bearer valid-token" } }),
      context
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data });
    expect(getQuotaMock).toHaveBeenCalledWith("instance-1", "codex.json");
  });

  it("区分账号不存在与供应商查询失败", async () => {
    const { GET } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/provider-quota/route");
    const { CliproxyAuthAccountNotFoundError } =
      await import("@/lib/services/cliproxy-auth-account-service");
    const { CliproxyManagementApiError } =
      await import("@/lib/services/cliproxy-management-client");
    const request = new NextRequest(url, { headers: { authorization: "Bearer valid-token" } });
    getQuotaMock.mockRejectedValueOnce(
      new CliproxyAuthAccountNotFoundError("instance-1", "codex.json")
    );
    expect((await GET(request, context)).status).toBe(404);
    getQuotaMock.mockRejectedValueOnce(
      new CliproxyManagementApiError("service_error", "供应商额度查询失败", 401)
    );
    expect((await GET(request, context)).status).toBe(502);
  });
});
