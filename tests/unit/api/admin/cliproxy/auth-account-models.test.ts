import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const listCliproxyAccountModelsMock = vi.fn();

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

vi.mock("@/lib/services/cliproxy-auth-account-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/cliproxy-auth-account-service")>();
  return {
    ...actual,
    listCliproxyAccountModels: (...args: unknown[]) => listCliproxyAccountModelsMock(...args),
  };
});

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH = "Bearer valid-token";
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

describe("Admin CLIProxyAPI auth-account models API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未鉴权返回 401", async () => {
    const { GET } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/models/route");
    const res = await GET(
      new NextRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts/codex-a.json/models",
        { method: "GET" }
      ),
      ctx({ id: "instance-1", accountName: "codex-a.json" })
    );
    expect(res.status).toBe(401);
  });

  it("返回模型列表", async () => {
    const { GET } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/models/route");
    listCliproxyAccountModelsMock.mockResolvedValueOnce([
      { id: "gpt-5", display_name: "GPT-5" },
      { id: "gpt-5-codex" },
    ]);

    const res = await GET(
      new NextRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts/codex-a.json/models",
        { method: "GET", headers: { authorization: AUTH } }
      ),
      ctx({ id: "instance-1", accountName: "codex-a.json" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe("gpt-5");
  });

  it("账号名经 URL 解码", async () => {
    const { GET } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/models/route");
    listCliproxyAccountModelsMock.mockResolvedValueOnce([]);

    await GET(
      new NextRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts/codex%20a.json/models",
        { method: "GET", headers: { authorization: AUTH } }
      ),
      ctx({ id: "instance-1", accountName: "codex%20a.json" })
    );

    expect(listCliproxyAccountModelsMock).toHaveBeenCalledWith("instance-1", "codex a.json");
  });

  it("CLIProxyAPI 不可达返回 502", async () => {
    const { GET } =
      await import("@/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/models/route");
    const { CliproxyManagementApiError } =
      await import("@/lib/services/cliproxy-management-client");
    listCliproxyAccountModelsMock.mockRejectedValueOnce(
      new CliproxyManagementApiError("unreachable", "upstream gone", null)
    );

    const res = await GET(
      new NextRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/auth-accounts/codex-a.json/models",
        { method: "GET", headers: { authorization: AUTH } }
      ),
      ctx({ id: "instance-1", accountName: "codex-a.json" })
    );
    expect(res.status).toBe(502);
  });
});
