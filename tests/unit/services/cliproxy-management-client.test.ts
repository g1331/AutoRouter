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
  deleteAuthFile,
  uploadAuthFile,
  downloadAuthFile,
  submitOAuthCallback,
  getLogs,
  CliproxyManagementApiError,
  CLIPROXY_OAUTH_PROVIDERS,
  isCliproxyOAuthProvider,
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

  // ── 新增 Provider 覆盖 ──────────────────────────────────────────────────

  it("CLIPROXY_OAUTH_PROVIDERS 包含新增的三个服务商", () => {
    expect(CLIPROXY_OAUTH_PROVIDERS).toContain("xai");
    expect(CLIPROXY_OAUTH_PROVIDERS).toContain("antigravity");
    expect(CLIPROXY_OAUTH_PROVIDERS).toContain("kimi");
    expect(CLIPROXY_OAUTH_PROVIDERS).toHaveLength(6);
  });

  it("isCliproxyOAuthProvider 对新 Provider 返回 true", () => {
    expect(isCliproxyOAuthProvider("xai")).toBe(true);
    expect(isCliproxyOAuthProvider("antigravity")).toBe(true);
    expect(isCliproxyOAuthProvider("kimi")).toBe(true);
    expect(isCliproxyOAuthProvider("unknown")).toBe(false);
  });

  it("getProviderAuthUrl xAI 映射到 xai-auth-url 端点", async () => {
    const fetchMock = stubFetchOnce(
      new Response(JSON.stringify({ url: "https://x.ai/oauth", state: "xai-state" }), {
        status: 200,
      })
    );

    const result = await getProviderAuthUrl(TARGET, "xai");

    expect(result).toEqual({ url: "https://x.ai/oauth", state: "xai-state" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://cliproxyapi:8317/v0/management/xai-auth-url?is_webui=true"
    );
  });

  it("getProviderAuthUrl antigravity 映射到 antigravity-auth-url 端点", async () => {
    const fetchMock = stubFetchOnce(
      new Response(JSON.stringify({ url: "https://ag.example/oauth", state: "ag-state" }), {
        status: 200,
      })
    );

    await getProviderAuthUrl(TARGET, "antigravity");

    expect(fetchMock.mock.calls[0][0]).toContain("antigravity-auth-url");
  });

  it("getProviderAuthUrl kimi 映射到 kimi-auth-url 端点", async () => {
    const fetchMock = stubFetchOnce(
      new Response(JSON.stringify({ url: "https://kimi.moonshot.cn/oauth", state: "kimi-state" }), {
        status: 200,
      })
    );

    await getProviderAuthUrl(TARGET, "kimi");

    expect(fetchMock.mock.calls[0][0]).toContain("kimi-auth-url");
  });

  // ── deleteAuthFile ──────────────────────────────────────────────────────

  it("deleteAuthFile 发送 DELETE 请求并携带正确请求体", async () => {
    const fetchMock = stubFetchOnce(new Response("", { status: 200 }));

    await deleteAuthFile(TARGET, "codex-a.json");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ name: "codex-a.json" });
    expect(fetchMock.mock.calls[0][0]).toBe("http://cliproxyapi:8317/v0/management/auth-files");
  });

  it("deleteAuthFile 请求体保留原始文件名（含空格）", async () => {
    const fetchMock = stubFetchOnce(new Response("", { status: 200 }));

    await deleteAuthFile(TARGET, "codex a.json");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ name: "codex a.json" });
  });

  it("deleteAuthFile 上游返回 401 时抛出鉴权错误", async () => {
    stubFetchOnce(new Response("unauthorized", { status: 401 }));
    await expect(deleteAuthFile(TARGET, "codex-a.json")).rejects.toMatchObject({
      kind: "auth_failed",
    });
  });

  // ── uploadAuthFile ──────────────────────────────────────────────────────

  it("uploadAuthFile 发送 POST 请求并携带文件内容", async () => {
    const fetchMock = stubFetchOnce(new Response("", { status: 200 }));
    const content = { token: "abc123", provider: "codex" };

    await uploadAuthFile(TARGET, content);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(content);
    expect(fetchMock.mock.calls[0][0]).toBe("http://cliproxyapi:8317/v0/management/auth-files");
  });

  it("uploadAuthFile 上游返回 4xx 时向上抛出服务异常", async () => {
    stubFetchOnce(new Response("conflict", { status: 409 }));
    await expect(uploadAuthFile(TARGET, { token: "x" })).rejects.toMatchObject({
      kind: "service_error",
    });
  });

  // ── downloadAuthFile ────────────────────────────────────────────────────

  it("downloadAuthFile 发送 GET 请求并对文件名 URL 编码", async () => {
    const fileContent = { token: "abc123", provider: "codex" };
    const fetchMock = stubFetchOnce(new Response(JSON.stringify(fileContent), { status: 200 }));

    const result = await downloadAuthFile(TARGET, "codex a.json");

    expect(result).toEqual(fileContent);
    expect(fetchMock.mock.calls[0][0]).toContain("name=codex%20a.json");
    expect(fetchMock.mock.calls[0][0]).toContain("/auth-files/download");
  });

  it("downloadAuthFile 上游返回非 JSON 内容时抛出服务异常", async () => {
    stubFetchOnce(new Response("not-json-at-all", { status: 200 }));
    await expect(downloadAuthFile(TARGET, "codex-a.json")).rejects.toMatchObject({
      kind: "service_error",
    });
  });

  it("downloadAuthFile 上游返回 404 时抛出服务异常", async () => {
    stubFetchOnce(new Response("not found", { status: 404 }));
    await expect(downloadAuthFile(TARGET, "missing.json")).rejects.toMatchObject({
      kind: "service_error",
    });
  });

  // ── submitOAuthCallback ─────────────────────────────────────────────────

  it("submitOAuthCallback 发送 POST 并携带正确请求体", async () => {
    const fetchMock = stubFetchOnce(new Response("", { status: 200 }));

    await submitOAuthCallback(TARGET, "codex", "https://callback.example/auth?code=xyz");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      provider: "codex",
      redirect_url: "https://callback.example/auth?code=xyz",
    });
    expect(fetchMock.mock.calls[0][0]).toBe("http://cliproxyapi:8317/v0/management/oauth-callback");
  });

  it("submitOAuthCallback 支持新增服务商 xai", async () => {
    const fetchMock = stubFetchOnce(new Response("", { status: 200 }));

    await submitOAuthCallback(TARGET, "xai", "https://callback.example/xai?code=abc");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).provider).toBe("xai");
  });

  // ── getLogs ─────────────────────────────────────────────────────────────

  it("getLogs 按 CLIProxyAPI wire 格式解析 lines / line-count / latest-timestamp", async () => {
    const wire = {
      lines: ["2026-05-31 10:00:00 INFO server started", "2026-05-31 10:00:01 WARN slow upstream"],
      "line-count": 2,
      "latest-timestamp": 1748685601,
    };
    const fetchMock = stubFetchOnce(new Response(JSON.stringify(wire), { status: 200 }));

    const result = await getLogs(TARGET);

    expect(result.lines).toEqual(wire.lines);
    expect(result.line_count).toBe(2);
    expect(result.latest_timestamp).toBe(1748685601);
    expect(fetchMock.mock.calls[0][0]).toBe("http://cliproxyapi:8317/v0/management/logs");
  });

  it("getLogs 把 limit / after 参数拼到 query string 上", async () => {
    const fetchMock = stubFetchOnce(
      new Response(JSON.stringify({ lines: [], "line-count": 0, "latest-timestamp": 0 }), {
        status: 200,
      })
    );

    await getLogs(TARGET, { limit: 200, after: 1748685000 });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("limit=200");
    expect(url).toContain("after=1748685000");
  });

  it("getLogs 不传参数时不附加 query string", async () => {
    const fetchMock = stubFetchOnce(
      new Response(JSON.stringify({ lines: [], "line-count": 0, "latest-timestamp": 0 }), {
        status: 200,
      })
    );

    await getLogs(TARGET);

    expect(fetchMock.mock.calls[0][0]).toBe("http://cliproxyapi:8317/v0/management/logs");
  });

  it("getLogs 上游返回空对象时落到 0 / 空数组兜底", async () => {
    stubFetchOnce(new Response(JSON.stringify({}), { status: 200 }));
    expect(await getLogs(TARGET)).toEqual({
      lines: [],
      line_count: 0,
      latest_timestamp: 0,
    });
  });

  it("getLogs 上游返回 400 时把错误正文透传到 message", async () => {
    stubFetchOnce(new Response("logging to file is disabled", { status: 400 }));

    await expect(getLogs(TARGET)).rejects.toMatchObject({
      kind: "service_error",
      statusCode: 400,
      message: expect.stringContaining("logging to file is disabled"),
    });
  });
});
