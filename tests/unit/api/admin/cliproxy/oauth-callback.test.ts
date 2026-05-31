import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const submitCliproxyOAuthCallbackMock = vi.fn();

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

vi.mock("@/lib/services/cliproxy-oauth-login-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/cliproxy-oauth-login-service")>();
  return {
    ...actual,
    submitCliproxyOAuthCallback: (...args: unknown[]) => submitCliproxyOAuthCallbackMock(...args),
  };
});

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH = "Bearer valid-token";

function jsonRequest(url: string, method: string, body?: unknown, auth = AUTH): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { authorization: auth, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

describe("Admin CLIProxyAPI OAuth callback API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未鉴权返回 401", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/oauth-callback/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/cliproxy/instances/instance-1/oauth-callback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "codex", redirect_url: "https://x" }),
      }),
      ctx({ id: "instance-1" })
    );
    expect(res.status).toBe(401);
  });

  it("非法 Provider 返回 400", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/oauth-callback/route");
    const res = await POST(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/oauth-callback",
        "POST",
        { provider: "unknown", redirect_url: "https://x" }
      ),
      ctx({ id: "instance-1" })
    );
    expect(res.status).toBe(400);
  });

  it("缺少 redirect_url 返回 400", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/oauth-callback/route");
    const res = await POST(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/oauth-callback",
        "POST",
        { provider: "codex" }
      ),
      ctx({ id: "instance-1" })
    );
    expect(res.status).toBe(400);
  });

  it("提交成功返回同步结果", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/oauth-callback/route");
    submitCliproxyOAuthCallbackMock.mockResolvedValueOnce({
      status: "ok",
      syncResult: { added: 1, updated: 0, removed: 0, total: 1 },
    });

    const res = await POST(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/oauth-callback",
        "POST",
        { provider: "codex", redirect_url: "https://callback.example/?code=abc" }
      ),
      ctx({ id: "instance-1" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("ok");
    expect(body.data.syncResult.added).toBe(1);
    expect(submitCliproxyOAuthCallbackMock).toHaveBeenCalledWith(
      "instance-1",
      "codex",
      "https://callback.example/?code=abc"
    );
  });

  it("支持新增的 Provider xai", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/oauth-callback/route");
    submitCliproxyOAuthCallbackMock.mockResolvedValueOnce({ status: "ok" });

    const res = await POST(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/oauth-callback",
        "POST",
        { provider: "xai", redirect_url: "https://callback.example/xai?code=abc" }
      ),
      ctx({ id: "instance-1" })
    );

    expect(res.status).toBe(200);
    expect(submitCliproxyOAuthCallbackMock).toHaveBeenCalledWith(
      "instance-1",
      "xai",
      "https://callback.example/xai?code=abc"
    );
  });
});
