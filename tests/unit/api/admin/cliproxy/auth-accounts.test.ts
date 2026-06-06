import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getCliproxyInstanceByIdMock = vi.fn();
const listCliproxyAuthAccountsMock = vi.fn();
const syncCliproxyAuthAccountsMock = vi.fn();
const setCliproxyAuthAccountStatusMock = vi.fn();
const updateCliproxyAuthAccountFieldsMock = vi.fn();
const initiateCliproxyOAuthLoginMock = vi.fn();
const pollCliproxyOAuthStatusMock = vi.fn();

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

vi.mock("@/lib/services/cliproxy-instance-crud", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/cliproxy-instance-crud")>();
  return {
    ...actual,
    getCliproxyInstanceById: (...args: unknown[]) => getCliproxyInstanceByIdMock(...args),
  };
});

vi.mock("@/lib/services/cliproxy-auth-account-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/cliproxy-auth-account-service")>();
  return {
    ...actual,
    listCliproxyAuthAccounts: (...args: unknown[]) => listCliproxyAuthAccountsMock(...args),
    syncCliproxyAuthAccounts: (...args: unknown[]) => syncCliproxyAuthAccountsMock(...args),
    setCliproxyAuthAccountStatus: (...args: unknown[]) => setCliproxyAuthAccountStatusMock(...args),
    updateCliproxyAuthAccountFields: (...args: unknown[]) =>
      updateCliproxyAuthAccountFieldsMock(...args),
  };
});

vi.mock("@/lib/services/cliproxy-oauth-login-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/cliproxy-oauth-login-service")>();
  return {
    ...actual,
    initiateCliproxyOAuthLogin: (...args: unknown[]) => initiateCliproxyOAuthLoginMock(...args),
    pollCliproxyOAuthStatus: (...args: unknown[]) => pollCliproxyOAuthStatusMock(...args),
  };
});

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH = "Bearer valid-token";

const sampleAccount = {
  id: "acc-1",
  instanceId: "instance-1",
  authFileName: "codex-a.json",
  provider: "codex",
  email: "a@x.com",
  status: "active",
  disabled: false,
  prefix: null,
  modelCount: 3,
  priority: null,
  note: null,
  rawMetadata: { name: "codex-a.json" },
  lastSyncedAt: new Date("2026-05-20T00:00:00.000Z"),
  createdAt: new Date("2026-05-20T00:00:00.000Z"),
  updatedAt: new Date("2026-05-20T00:00:00.000Z"),
};

function jsonRequest(url: string, method: string, body?: unknown, auth = AUTH): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { authorization: auth, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

describe("Admin CLIProxyAPI auth accounts API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未鉴权时账号列表返回 401", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/route");
    const res = await GET(
      new NextRequest("http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts", {
        method: "GET",
      }),
      ctx({ id: "instance-1" })
    );
    expect(res.status).toBe(401);
  });

  it("列出实例下账号", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/route");
    getCliproxyInstanceByIdMock.mockResolvedValueOnce({ id: "instance-1" });
    listCliproxyAuthAccountsMock.mockResolvedValueOnce([sampleAccount]);

    const res = await GET(
      jsonRequest("http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts", "GET"),
      ctx({ id: "instance-1" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      auth_file_name: "codex-a.json",
      provider: "codex",
      model_count: 3,
    });
  });

  it("列出账号时实例不存在返回 404", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/route");
    getCliproxyInstanceByIdMock.mockResolvedValueOnce(null);

    const res = await GET(
      jsonRequest("http://localhost/api/admin/cliproxy/instances/x/auth-accounts", "GET"),
      ctx({ id: "x" })
    );
    expect(res.status).toBe(404);
  });

  it("触发账号同步返回同步结果", async () => {
    const { POST } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/sync/route");
    syncCliproxyAuthAccountsMock.mockResolvedValueOnce({
      added: 2,
      updated: 1,
      removed: 0,
      total: 3,
    });

    const res = await POST(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts/sync",
        "POST"
      ),
      ctx({ id: "instance-1" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ added: 2, updated: 1 });
  });

  it("同步遇到实例不存在返回 404", async () => {
    const { POST } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/sync/route");
    const { CliproxyInstanceNotFoundError } = await import("@/lib/services/cliproxy-instance-crud");
    syncCliproxyAuthAccountsMock.mockRejectedValueOnce(
      new CliproxyInstanceNotFoundError("missing")
    );

    const res = await POST(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/missing/auth-accounts/sync",
        "POST"
      ),
      ctx({ id: "missing" })
    );
    expect(res.status).toBe(404);
  });

  it("同步遇到管理 API 失败返回 502", async () => {
    const { POST } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/sync/route");
    const { CliproxyManagementApiError } =
      await import("@/lib/services/cliproxy-management-client");
    syncCliproxyAuthAccountsMock.mockRejectedValueOnce(
      new CliproxyManagementApiError("unreachable", "地址不可达", null)
    );

    const res = await POST(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts/sync",
        "POST"
      ),
      ctx({ id: "instance-1" })
    );
    expect(res.status).toBe(502);
  });

  it("启停账号成功", async () => {
    const { PATCH } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/status/route");
    setCliproxyAuthAccountStatusMock.mockResolvedValueOnce({ ...sampleAccount, disabled: true });

    const res = await PATCH(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts/codex-a.json/status",
        "PATCH",
        { disabled: true }
      ),
      ctx({ id: "instance-1", accountName: "codex-a.json" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.disabled).toBe(true);
    expect(setCliproxyAuthAccountStatusMock).toHaveBeenCalledWith(
      "instance-1",
      "codex-a.json",
      true
    );
  });

  it("启停账号支持含邮箱与点号的真实账号文件名", async () => {
    const { PATCH } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/status/route");
    const realName = "codex-user@example.com-plus.json";
    setCliproxyAuthAccountStatusMock.mockResolvedValueOnce({ ...sampleAccount, disabled: true });

    const res = await PATCH(
      jsonRequest(
        `http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts/${encodeURIComponent(
          realName
        )}/status`,
        "PATCH",
        { disabled: true }
      ),
      ctx({ id: "instance-1", accountName: realName })
    );

    expect(res.status).toBe(200);
    expect(setCliproxyAuthAccountStatusMock).toHaveBeenCalledWith("instance-1", realName, true);
  });

  it("启停账号缺少 disabled 字段返回 400", async () => {
    const { PATCH } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/status/route");

    const res = await PATCH(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts/codex-a.json/status",
        "PATCH",
        {}
      ),
      ctx({ id: "instance-1", accountName: "codex-a.json" })
    );
    expect(res.status).toBe(400);
    expect(setCliproxyAuthAccountStatusMock).not.toHaveBeenCalled();
  });

  it("启停不存在的账号返回 404", async () => {
    const { PATCH } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/status/route");
    const { CliproxyAuthAccountNotFoundError } =
      await import("@/lib/services/cliproxy-auth-account-service");
    setCliproxyAuthAccountStatusMock.mockRejectedValueOnce(
      new CliproxyAuthAccountNotFoundError("instance-1", "missing.json")
    );

    const res = await PATCH(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts/missing.json/status",
        "PATCH",
        { disabled: true }
      ),
      ctx({ id: "instance-1", accountName: "missing.json" })
    );
    expect(res.status).toBe(404);
  });

  it("更新账号字段成功", async () => {
    const { PATCH } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/route");
    updateCliproxyAuthAccountFieldsMock.mockResolvedValueOnce({
      ...sampleAccount,
      prefix: "team-a",
    });

    const res = await PATCH(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts/codex-a.json",
        "PATCH",
        { prefix: "team-a" }
      ),
      ctx({ id: "instance-1", accountName: "codex-a.json" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.prefix).toBe("team-a");
  });

  it("更新账号字段空请求体返回 400", async () => {
    const { PATCH } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/route");

    const res = await PATCH(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts/codex-a.json",
        "PATCH",
        {}
      ),
      ctx({ id: "instance-1", accountName: "codex-a.json" })
    );
    expect(res.status).toBe(400);
    expect(updateCliproxyAuthAccountFieldsMock).not.toHaveBeenCalled();
  });

  it("发起 OAuth 登录返回授权地址", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/oauth-login/route");
    initiateCliproxyOAuthLoginMock.mockResolvedValueOnce({
      provider: "codex",
      url: "https://auth.example/x",
      state: "state-1",
    });

    const res = await POST(
      jsonRequest("http://localhost/api/admin/cliproxy/instances/instance-1/oauth-login", "POST", {
        provider: "codex",
      }),
      ctx({ id: "instance-1" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ url: "https://auth.example/x", state: "state-1" });
  });

  it("发起 OAuth 登录服务商非法返回 400", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/oauth-login/route");

    const res = await POST(
      jsonRequest("http://localhost/api/admin/cliproxy/instances/instance-1/oauth-login", "POST", {
        provider: "facebook",
      }),
      ctx({ id: "instance-1" })
    );
    expect(res.status).toBe(400);
    expect(initiateCliproxyOAuthLoginMock).not.toHaveBeenCalled();
  });

  it("轮询 OAuth 登录状态", async () => {
    const { GET } =
      await import("@/app/api/admin/cliproxy/instances/[id]/oauth-login/status/route");
    pollCliproxyOAuthStatusMock.mockResolvedValueOnce({ status: "wait" });

    const res = await GET(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/oauth-login/status?state=state-1",
        "GET"
      ),
      ctx({ id: "instance-1" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("wait");
    expect(pollCliproxyOAuthStatusMock).toHaveBeenCalledWith("instance-1", "state-1");
  });

  it("轮询 OAuth 登录状态缺少 state 返回 400", async () => {
    const { GET } =
      await import("@/app/api/admin/cliproxy/instances/[id]/oauth-login/status/route");

    const res = await GET(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/oauth-login/status",
        "GET"
      ),
      ctx({ id: "instance-1" })
    );
    expect(res.status).toBe(400);
    expect(pollCliproxyOAuthStatusMock).not.toHaveBeenCalled();
  });
});
