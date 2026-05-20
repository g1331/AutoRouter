import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const listCliproxyInstancesMock = vi.fn();
const createCliproxyInstanceMock = vi.fn();
const getCliproxyInstanceByIdMock = vi.fn();
const updateCliproxyInstanceMock = vi.fn();
const deleteCliproxyInstanceMock = vi.fn();
const getCliproxyInstanceRowMock = vi.fn();
const getDecryptedManagementKeyMock = vi.fn();
const testCliproxyConnectionMock = vi.fn();

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

vi.mock("@/lib/services/cliproxy-instance-crud", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/cliproxy-instance-crud")>();
  return {
    ...actual,
    listCliproxyInstances: (...args: unknown[]) => listCliproxyInstancesMock(...args),
    createCliproxyInstance: (...args: unknown[]) => createCliproxyInstanceMock(...args),
    getCliproxyInstanceById: (...args: unknown[]) => getCliproxyInstanceByIdMock(...args),
    updateCliproxyInstance: (...args: unknown[]) => updateCliproxyInstanceMock(...args),
    deleteCliproxyInstance: (...args: unknown[]) => deleteCliproxyInstanceMock(...args),
    getCliproxyInstanceRow: (...args: unknown[]) => getCliproxyInstanceRowMock(...args),
    getDecryptedManagementKey: (...args: unknown[]) => getDecryptedManagementKeyMock(...args),
  };
});

vi.mock("@/lib/services/cliproxy-connection-tester", () => ({
  testCliproxyConnection: (...args: unknown[]) => testCliproxyConnectionMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH = "Bearer valid-token";

const sampleInstance = {
  id: "instance-1",
  name: "codex-pool",
  mode: "managed" as const,
  baseUrl: "http://cliproxyapi:8317/v1",
  managementUrl: "http://cliproxyapi:8317",
  hasClientApiKey: true,
  hasManagementKey: true,
  enabled: true,
  description: null,
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

describe("Admin CLIProxyAPI instances API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未鉴权时列表请求返回 401", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/route");
    const res = await GET(
      new NextRequest("http://localhost/api/admin/cliproxy/instances", { method: "GET" })
    );
    expect(res.status).toBe(401);
  });

  it("列出全部实例", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/route");
    listCliproxyInstancesMock.mockResolvedValueOnce([sampleInstance]);

    const res = await GET(jsonRequest("http://localhost/api/admin/cliproxy/instances", "GET"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: "instance-1",
      base_url: "http://cliproxyapi:8317/v1",
      has_client_api_key: true,
    });
  });

  it("创建实例成功返回 201 且响应不含密钥明文", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/route");
    createCliproxyInstanceMock.mockResolvedValueOnce(sampleInstance);

    const res = await POST(
      jsonRequest("http://localhost/api/admin/cliproxy/instances", "POST", {
        name: "codex-pool",
        mode: "managed",
        base_url: "http://cliproxyapi:8317/v1",
        management_url: "http://cliproxyapi:8317",
        client_api_key: "client-secret",
        management_key: "mgmt-secret",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("client-secret");
    expect(serialized).not.toContain("mgmt-secret");
    expect(body.data).not.toHaveProperty("client_api_key");
  });

  it("创建实例缺少必填字段返回 400", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/route");

    const res = await POST(
      jsonRequest("http://localhost/api/admin/cliproxy/instances", "POST", {
        name: "codex-pool",
        mode: "managed",
      })
    );

    expect(res.status).toBe(400);
    expect(createCliproxyInstanceMock).not.toHaveBeenCalled();
  });

  it("创建实例名称冲突返回 409", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/route");
    const { CliproxyInstanceNameConflictError } =
      await import("@/lib/services/cliproxy-instance-crud");
    createCliproxyInstanceMock.mockRejectedValueOnce(
      new CliproxyInstanceNameConflictError("codex-pool")
    );

    const res = await POST(
      jsonRequest("http://localhost/api/admin/cliproxy/instances", "POST", {
        name: "codex-pool",
        mode: "managed",
        base_url: "http://cliproxyapi:8317/v1",
        management_url: "http://cliproxyapi:8317",
        client_api_key: "k",
        management_key: "k",
      })
    );

    expect(res.status).toBe(409);
  });

  it("查询不存在的实例返回 404", async () => {
    const { GET } = await import("@/app/api/admin/cliproxy/instances/[id]/route");
    getCliproxyInstanceByIdMock.mockResolvedValueOnce(null);

    const res = await GET(jsonRequest("http://localhost/api/admin/cliproxy/instances/x", "GET"), {
      params: Promise.resolve({ id: "x" }),
    });

    expect(res.status).toBe(404);
  });

  it("更新实例成功", async () => {
    const { PATCH } = await import("@/app/api/admin/cliproxy/instances/[id]/route");
    updateCliproxyInstanceMock.mockResolvedValueOnce({ ...sampleInstance, enabled: false });

    const res = await PATCH(
      jsonRequest("http://localhost/api/admin/cliproxy/instances/instance-1", "PATCH", {
        enabled: false,
      }),
      { params: Promise.resolve({ id: "instance-1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.enabled).toBe(false);
  });

  it("更新不存在的实例返回 404", async () => {
    const { PATCH } = await import("@/app/api/admin/cliproxy/instances/[id]/route");
    const { CliproxyInstanceNotFoundError } = await import("@/lib/services/cliproxy-instance-crud");
    updateCliproxyInstanceMock.mockRejectedValueOnce(new CliproxyInstanceNotFoundError("missing"));

    const res = await PATCH(
      jsonRequest("http://localhost/api/admin/cliproxy/instances/missing", "PATCH", {
        enabled: false,
      }),
      { params: Promise.resolve({ id: "missing" }) }
    );

    expect(res.status).toBe(404);
  });

  it("更新实例空请求体返回 400", async () => {
    const { PATCH } = await import("@/app/api/admin/cliproxy/instances/[id]/route");

    const res = await PATCH(
      jsonRequest("http://localhost/api/admin/cliproxy/instances/instance-1", "PATCH", {}),
      { params: Promise.resolve({ id: "instance-1" }) }
    );

    expect(res.status).toBe(400);
    expect(updateCliproxyInstanceMock).not.toHaveBeenCalled();
  });

  it("删除实例成功", async () => {
    const { DELETE } = await import("@/app/api/admin/cliproxy/instances/[id]/route");
    deleteCliproxyInstanceMock.mockResolvedValueOnce(undefined);

    const res = await DELETE(
      jsonRequest("http://localhost/api/admin/cliproxy/instances/instance-1", "DELETE"),
      { params: Promise.resolve({ id: "instance-1" }) }
    );

    expect(res.status).toBe(200);
    expect(deleteCliproxyInstanceMock).toHaveBeenCalledWith("instance-1");
  });

  it("对已保存实例执行连通性检测", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/test/route");
    getCliproxyInstanceRowMock.mockResolvedValueOnce({
      id: "instance-1",
      managementUrl: "http://cliproxyapi:8317",
      managementKeyEncrypted: "enc(mgmt-key)",
    });
    getDecryptedManagementKeyMock.mockReturnValueOnce("mgmt-key");
    testCliproxyConnectionMock.mockResolvedValueOnce({
      status: "success",
      message: "连接正常",
      statusCode: 200,
    });

    const res = await POST(
      jsonRequest("http://localhost/api/admin/cliproxy/instances/instance-1/test", "POST"),
      { params: Promise.resolve({ id: "instance-1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("success");
    expect(testCliproxyConnectionMock).toHaveBeenCalledWith({
      managementUrl: "http://cliproxyapi:8317",
      managementKey: "mgmt-key",
    });
  });

  it("对不存在实例执行连通性检测返回 404", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/[id]/test/route");
    getCliproxyInstanceRowMock.mockResolvedValueOnce(null);

    const res = await POST(
      jsonRequest("http://localhost/api/admin/cliproxy/instances/missing/test", "POST"),
      { params: Promise.resolve({ id: "missing" }) }
    );

    expect(res.status).toBe(404);
  });

  it("创建前预检测未保存配置", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/test/route");
    testCliproxyConnectionMock.mockResolvedValueOnce({
      status: "auth_failed",
      message: "管理密钥无效",
      statusCode: 401,
    });

    const res = await POST(
      jsonRequest("http://localhost/api/admin/cliproxy/instances/test", "POST", {
        management_url: "http://cliproxyapi:8317",
        management_key: "wrong-key",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("auth_failed");
  });

  it("预检测缺少字段返回 400", async () => {
    const { POST } = await import("@/app/api/admin/cliproxy/instances/test/route");

    const res = await POST(
      jsonRequest("http://localhost/api/admin/cliproxy/instances/test", "POST", {
        management_url: "http://cliproxyapi:8317",
      })
    );

    expect(res.status).toBe(400);
    expect(testCliproxyConnectionMock).not.toHaveBeenCalled();
  });
});
