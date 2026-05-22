import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  listAuthFiles,
  getAuthFileModels,
  patchAuthFileStatus,
  patchAuthFileFields,
  getProviderAuthUrl,
  getAuthStatus,
  CliproxyManagementApiError,
} from "@/lib/services/cliproxy-management-client";

const TARGET = { managementUrl: "http://cliproxyapi:8317", managementKey: "mgmt-key" };

function stubFetchOnce(response: Response) {
  const fetchMock = vi.fn().mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("cliproxy-management-client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listAuthFiles 注入 Bearer 鉴权头并解析 files", async () => {
    const fetchMock = stubFetchOnce(
      new Response(JSON.stringify({ files: [{ name: "codex-a.json", provider: "codex" }] }), {
        status: 200,
      })
    );

    const files = await listAuthFiles(TARGET);

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("codex-a.json");
    expect(fetchMock.mock.calls[0][0]).toBe("http://cliproxyapi:8317/v0/management/auth-files");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer mgmt-key");
  });

  it("listAuthFiles 响应缺少 files 字段时返回空数组", async () => {
    stubFetchOnce(new Response(JSON.stringify({}), { status: 200 }));
    expect(await listAuthFiles(TARGET)).toEqual([]);
  });

  it("getAuthFileModels 对账号名 URL 编码并解析 models", async () => {
    const fetchMock = stubFetchOnce(
      new Response(JSON.stringify({ models: [{ id: "gpt-5.5" }, { id: "gpt-5.5-codex" }] }), {
        status: 200,
      })
    );

    const models = await getAuthFileModels(TARGET, "codex a.json");

    expect(models).toHaveLength(2);
    expect(fetchMock.mock.calls[0][0]).toContain("name=codex%20a.json");
  });

  it("patchAuthFileStatus 发送 PATCH 与正确请求体", async () => {
    const fetchMock = stubFetchOnce(new Response("", { status: 200 }));

    await patchAuthFileStatus(TARGET, "codex-a.json", true);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ name: "codex-a.json", disabled: true });
  });

  it("patchAuthFileFields 发送字段更新请求体", async () => {
    const fetchMock = stubFetchOnce(new Response("", { status: 200 }));

    await patchAuthFileFields(TARGET, {
      name: "codex-a.json",
      prefix: "team-a",
      priority: 5,
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      name: "codex-a.json",
      prefix: "team-a",
      priority: 5,
    });
  });

  it("getProviderAuthUrl 默认携带 is_webui=true 并返回 url 与 state", async () => {
    const fetchMock = stubFetchOnce(
      new Response(JSON.stringify({ url: "https://auth.example/x", state: "state-1" }), {
        status: 200,
      })
    );

    const result = await getProviderAuthUrl(TARGET, "codex");

    expect(result).toEqual({ url: "https://auth.example/x", state: "state-1" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://cliproxyapi:8317/v0/management/codex-auth-url?is_webui=true"
    );
  });

  it("getProviderAuthUrl 各服务商映射到正确端点", async () => {
    stubFetchOnce(new Response(JSON.stringify({ url: "u", state: "s" }), { status: 200 }));
    await getProviderAuthUrl(TARGET, "gemini");
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(
      "gemini-cli-auth-url"
    );
  });

  it("getProviderAuthUrl 缺少 url 或 state 时抛出服务异常", async () => {
    stubFetchOnce(new Response(JSON.stringify({ url: "u" }), { status: 200 }));
    await expect(getProviderAuthUrl(TARGET, "anthropic")).rejects.toMatchObject({
      kind: "service_error",
    });
  });

  it("getAuthStatus 解析 ok / wait / error 三种状态", async () => {
    stubFetchOnce(new Response(JSON.stringify({ status: "wait" }), { status: 200 }));
    expect((await getAuthStatus(TARGET, "s")).status).toBe("wait");

    stubFetchOnce(
      new Response(JSON.stringify({ status: "error", error: "denied" }), { status: 200 })
    );
    const errResult = await getAuthStatus(TARGET, "s");
    expect(errResult.status).toBe("error");
    expect(errResult.error).toBe("denied");

    stubFetchOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    expect((await getAuthStatus(TARGET, "s")).status).toBe("ok");
  });

  it("管理 API 返回 401 时抛出鉴权失败错误", async () => {
    stubFetchOnce(new Response("unauthorized", { status: 401 }));
    await expect(listAuthFiles(TARGET)).rejects.toMatchObject({
      kind: "auth_failed",
    });
  });

  it("管理 API 返回 500 时抛出服务异常错误", async () => {
    stubFetchOnce(new Response("error", { status: 500 }));
    await expect(listAuthFiles(TARGET)).rejects.toMatchObject({
      kind: "service_error",
    });
  });

  it("连接失败时抛出不可达错误", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const error = await listAuthFiles(TARGET).catch((e) => e);
    expect(error).toBeInstanceOf(CliproxyManagementApiError);
    expect(error.kind).toBe("unreachable");
  });

  it("请求超时时抛出不可达错误", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));
    await expect(listAuthFiles(TARGET)).rejects.toMatchObject({ kind: "unreachable" });
  });
});
