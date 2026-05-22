import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { testCliproxyConnection } from "@/lib/services/cliproxy-connection-tester";

describe("cliproxy-connection-tester", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("管理 API 返回 2xx 时判定为连接成功", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await testCliproxyConnection({
      managementUrl: "http://cliproxyapi:8317",
      managementKey: "mgmt-key",
    });

    expect(result.status).toBe("success");
    expect(result.statusCode).toBe(200);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toBe("http://cliproxyapi:8317/v0/management/auth-files");
    const calledInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect((calledInit.headers as Record<string, string>).Authorization).toBe("Bearer mgmt-key");
  });

  it("管理 API 返回 401 时判定为鉴权失败", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
    );

    const result = await testCliproxyConnection({
      managementUrl: "http://cliproxyapi:8317",
      managementKey: "wrong-key",
    });

    expect(result.status).toBe("auth_failed");
    expect(result.statusCode).toBe(401);
  });

  it("管理 API 返回其他非 2xx 时判定为服务异常", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("error", { status: 500 })));

    const result = await testCliproxyConnection({
      managementUrl: "http://cliproxyapi:8317",
      managementKey: "mgmt-key",
    });

    expect(result.status).toBe("service_error");
    expect(result.statusCode).toBe(500);
  });

  it("连接失败时判定为地址不可达", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED")));

    const result = await testCliproxyConnection({
      managementUrl: "http://cliproxyapi:8317",
      managementKey: "mgmt-key",
    });

    expect(result.status).toBe("unreachable");
    expect(result.statusCode).toBeNull();
  });

  it("请求超时时判定为地址不可达", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(abortError));

    const result = await testCliproxyConnection({
      managementUrl: "http://cliproxyapi:8317",
      managementKey: "mgmt-key",
      timeout: 1,
    });

    expect(result.status).toBe("unreachable");
    expect(result.message).toContain("1 秒");
  });

  it("地址已包含 /v0/management 前缀时不重复拼接", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await testCliproxyConnection({
      managementUrl: "http://cliproxyapi:8317/v0/management/",
      managementKey: "mgmt-key",
    });

    expect(fetchMock.mock.calls[0][0]).toBe("http://cliproxyapi:8317/v0/management/auth-files");
  });

  it("地址格式非法时判定为地址不可达", async () => {
    const result = await testCliproxyConnection({
      managementUrl: "not-a-url",
      managementKey: "mgmt-key",
    });

    expect(result.status).toBe("unreachable");
  });
});
