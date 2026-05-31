import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const listCliproxyInstanceLogsMock = vi.fn();

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

vi.mock("@/lib/services/cliproxy-instance-logs-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/cliproxy-instance-logs-service")>();
  return {
    ...actual,
    listCliproxyInstanceLogs: (...args: unknown[]) => listCliproxyInstanceLogsMock(...args),
  };
});

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH = "Bearer valid-token";
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

describe("Admin CLIProxyAPI logs API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未鉴权返回 401", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/logs/route");
    const res = await GET(
      new NextRequest("http://localhost/api/admin/cliproxy/instances/instance-1/logs", {
        method: "GET",
      }),
      ctx({ id: "instance-1" })
    );
    expect(res.status).toBe(401);
  });

  it("返回日志数组", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/logs/route");
    listCliproxyInstanceLogsMock.mockResolvedValueOnce([
      { timestamp: "2025-05-31T10:00:00Z", level: "info", message: "ok" },
    ]);

    const res = await GET(
      new NextRequest("http://localhost/api/admin/cliproxy/instances/instance-1/logs", {
        method: "GET",
        headers: { authorization: AUTH },
      }),
      ctx({ id: "instance-1" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].message).toBe("ok");
    expect(listCliproxyInstanceLogsMock).toHaveBeenCalledWith("instance-1", undefined);
  });

  it("透传 since 查询参数", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/logs/route");
    listCliproxyInstanceLogsMock.mockResolvedValueOnce([]);

    await GET(
      new NextRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/logs?since=2025-05-31T09:00:00Z",
        { method: "GET", headers: { authorization: AUTH } }
      ),
      ctx({ id: "instance-1" })
    );

    expect(listCliproxyInstanceLogsMock).toHaveBeenCalledWith("instance-1", "2025-05-31T09:00:00Z");
  });

  it("实例不存在返回 404", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/logs/route");
    const { CliproxyInstanceNotFoundError } = await import("@/lib/services/cliproxy-instance-crud");
    listCliproxyInstanceLogsMock.mockRejectedValueOnce(
      new CliproxyInstanceNotFoundError("missing")
    );

    const res = await GET(
      new NextRequest("http://localhost/api/admin/cliproxy/instances/missing/logs", {
        method: "GET",
        headers: { authorization: AUTH },
      }),
      ctx({ id: "missing" })
    );
    expect(res.status).toBe(404);
  });
});
