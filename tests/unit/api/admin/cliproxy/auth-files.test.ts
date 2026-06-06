import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const uploadCliproxyAuthFileMock = vi.fn();
const downloadCliproxyAuthFileMock = vi.fn();
const deleteCliproxyAuthAccountMock = vi.fn();

// Mock admin authorization: the route now calls requireAdmin (the role-aware
// guard). importActual keeps errorResponse and getPaginationParams real so
// response shapes are unchanged; only the gate decision is driven by the
// request token.
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

vi.mock("@/lib/services/cliproxy-auth-account-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/cliproxy-auth-account-service")>();
  return {
    ...actual,
    uploadCliproxyAuthFile: (...args: unknown[]) => uploadCliproxyAuthFileMock(...args),
    downloadCliproxyAuthFile: (...args: unknown[]) => downloadCliproxyAuthFileMock(...args),
    deleteCliproxyAuthAccount: (...args: unknown[]) => deleteCliproxyAuthAccountMock(...args),
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

describe("Admin CLIProxyAPI auth-files API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── POST upload ───────────────────────────────────────────────────────────

  it("未鉴权时上传返回 401", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/auth-files/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/cliproxy/instances/instance-1/auth-files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "x" }),
      }),
      ctx({ id: "instance-1" })
    );
    expect(res.status).toBe(401);
  });

  it("上传请求体不是合法 JSON 返回 400", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/auth-files/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/cliproxy/instances/instance-1/auth-files", {
        method: "POST",
        headers: { authorization: AUTH, "content-type": "application/json" },
        body: "not-json",
      }),
      ctx({ id: "instance-1" })
    );
    expect(res.status).toBe(400);
  });

  it("上传请求体不是对象返回 400", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/auth-files/route");
    const res = await POST(
      jsonRequest("http://localhost/api/admin/cliproxy/instances/instance-1/auth-files", "POST", [
        "x",
      ]),
      ctx({ id: "instance-1" })
    );
    expect(res.status).toBe(400);
  });

  it("上传成功后返回同步结果", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/auth-files/route");
    uploadCliproxyAuthFileMock.mockResolvedValueOnce({
      added: 1,
      updated: 0,
      removed: 0,
      total: 1,
    });

    const res = await POST(
      jsonRequest("http://localhost/api/admin/cliproxy/instances/instance-1/auth-files", "POST", {
        token: "abc",
        provider: "codex",
      }),
      ctx({ id: "instance-1" })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data).toMatchObject({ added: 1, total: 1 });
    expect(uploadCliproxyAuthFileMock).toHaveBeenCalledWith("instance-1", {
      token: "abc",
      provider: "codex",
    });
  });

  it("上传时实例不存在返回 404", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/auth-files/route");
    const { CliproxyInstanceNotFoundError } = await import("@/lib/services/cliproxy-instance-crud");
    uploadCliproxyAuthFileMock.mockRejectedValueOnce(new CliproxyInstanceNotFoundError("missing"));

    const res = await POST(
      jsonRequest("http://localhost/api/admin/cliproxy/instances/missing/auth-files", "POST", {
        token: "x",
      }),
      ctx({ id: "missing" })
    );
    expect(res.status).toBe(404);
  });

  // ── GET download ──────────────────────────────────────────────────────────

  it("下载未鉴权返回 401", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/auth-files/[name]/route");
    const res = await GET(
      new NextRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-files/codex-a.json",
        { method: "GET" }
      ),
      ctx({ id: "instance-1", name: "codex-a.json" })
    );
    expect(res.status).toBe(401);
  });

  it("下载返回 application/json 与正确文件名", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/auth-files/[name]/route");
    downloadCliproxyAuthFileMock.mockResolvedValueOnce({ token: "abc" });

    const res = await GET(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-files/codex-a.json",
        "GET"
      ),
      ctx({ id: "instance-1", name: "codex-a.json" })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toContain("codex-a.json");
    const body = await res.json();
    expect(body).toEqual({ token: "abc" });
  });

  it("下载时账号文件名经 URL 解码", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/auth-files/[name]/route");
    downloadCliproxyAuthFileMock.mockResolvedValueOnce({ token: "x" });

    await GET(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-files/codex%20a.json",
        "GET"
      ),
      ctx({ id: "instance-1", name: "codex%20a.json" })
    );

    expect(downloadCliproxyAuthFileMock).toHaveBeenCalledWith("instance-1", "codex a.json");
  });

  // ── DELETE ────────────────────────────────────────────────────────────────

  it("删除成功返回 200 与文件名", async () => {
    const { DELETE } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-files/[name]/route");
    deleteCliproxyAuthAccountMock.mockResolvedValueOnce(undefined);

    const res = await DELETE(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-files/codex-a.json",
        "DELETE"
      ),
      ctx({ id: "instance-1", name: "codex-a.json" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.name).toBe("codex-a.json");
  });

  it("删除时 CLIProxyAPI 不可达返回 502", async () => {
    const { DELETE } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-files/[name]/route");
    const { CliproxyManagementApiError } =
      await import("@/lib/services/cliproxy-management-client");
    deleteCliproxyAuthAccountMock.mockRejectedValueOnce(
      new CliproxyManagementApiError("unreachable", "upstream gone", null)
    );

    const res = await DELETE(
      jsonRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-files/codex-a.json",
        "DELETE"
      ),
      ctx({ id: "instance-1", name: "codex-a.json" })
    );
    expect(res.status).toBe(502);
  });
});
