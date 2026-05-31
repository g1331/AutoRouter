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

  it("返回 lines / line_count / latest_timestamp 三元组", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/logs/route");
    listCliproxyInstanceLogsMock.mockResolvedValueOnce({
      lines: ["2026-05-31 10:00:00 INFO server started"],
      line_count: 1,
      latest_timestamp: 1748685600,
    });

    const res = await GET(
      new NextRequest("http://localhost/api/admin/cliproxy/instances/instance-1/logs", {
        method: "GET",
        headers: { authorization: AUTH },
      }),
      ctx({ id: "instance-1" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.lines).toEqual(["2026-05-31 10:00:00 INFO server started"]);
    expect(body.data.line_count).toBe(1);
    expect(body.data.latest_timestamp).toBe(1748685600);
    expect(listCliproxyInstanceLogsMock).toHaveBeenCalledWith("instance-1", {
      limit: undefined,
      after: undefined,
    });
  });

  it("透传 limit 与 after 查询参数到服务层", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/logs/route");
    listCliproxyInstanceLogsMock.mockResolvedValueOnce({
      lines: [],
      line_count: 0,
      latest_timestamp: 0,
    });

    await GET(
      new NextRequest(
        "http://localhost/api/admin/cliproxy/instances/instance-1/logs?limit=200&after=1748685000",
        { method: "GET", headers: { authorization: AUTH } }
      ),
      ctx({ id: "instance-1" })
    );

    expect(listCliproxyInstanceLogsMock).toHaveBeenCalledWith("instance-1", {
      limit: 200,
      after: 1748685000,
    });
  });

  it("limit 不是数字时返回 400", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/logs/route");

    const res = await GET(
      new NextRequest("http://localhost/api/admin/cliproxy/instances/instance-1/logs?limit=abc", {
        method: "GET",
        headers: { authorization: AUTH },
      }),
      ctx({ id: "instance-1" })
    );
    expect(res.status).toBe(400);
    expect(listCliproxyInstanceLogsMock).not.toHaveBeenCalled();
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
