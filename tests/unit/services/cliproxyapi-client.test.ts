import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CliproxyApiClientError,
  CliproxyApiManagementClient,
} from "@/lib/services/cliproxyapi-client";

vi.mock("@/lib/services/upstream-ssrf-validator", () => ({
  isUrlSafe: vi.fn((url: string) =>
    url.includes("localhost")
      ? { safe: false, reason: "Loopback addresses are not allowed" }
      : { safe: true }
  ),
  resolveAndValidateHostname: vi.fn(() => Promise.resolve({ safe: true })),
}));

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function createClient(fetchImpl: typeof fetch): CliproxyApiManagementClient {
  return new CliproxyApiManagementClient({
    baseUrl: "http://localhost:8317/v1",
    clientApiKey: "cpa-client-key",
    managementUrl: "http://localhost:8317/v0/management",
    managementSecret: "mgmt-secret",
    outboundProxyUrl: "socks5://127.0.0.1:1080",
    fetchImpl,
  });
}

describe("CliproxyApiManagementClient", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("lists auth files with management authentication headers", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        files: [
          {
            id: "auth-1",
            name: "codex.json",
            provider: "codex",
            prefix: "main",
            disabled: false,
            status: "ready",
            model_count: 3,
            access_token: "oauth-access-token",
            refresh_token: "oauth-refresh-token",
            headers: { Authorization: "Bearer oauth-access-token" },
          },
        ],
      })
    );

    const accounts = await createClient(fetchMock).listAuthFiles();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8317/v0/management/auth-files",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("Authorization")).toBe("Bearer mgmt-secret");
    expect((headers as Headers).get("X-Management-Key")).toBe("mgmt-secret");
    expect(accounts).toEqual([
      expect.objectContaining({
        id: "auth-1",
        name: "codex.json",
        provider: "codex",
        prefix: "main",
        enabled: true,
        model_count: 3,
        status: "ready",
        metadata: null,
      }),
    ]);
    expect(JSON.stringify(accounts)).not.toContain("oauth-access-token");
    expect(JSON.stringify(accounts)).not.toContain("oauth-refresh-token");
  });

  it("lists auth file models with normalized provider names", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        models: [
          { id: "claude-sonnet-4-5", type: "anthropic" },
          { id: "gemini-2.5-pro", provider: "gemini-cli" },
        ],
      })
    );

    const models = await createClient(fetchMock).listAuthFileModels("claude.json");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:8317/v0/management/auth-files/models?name=claude.json"
    );
    expect(models).toEqual([
      {
        model: "claude-sonnet-4-5",
        provider: "claude",
        account_id: "claude.json",
        account_prefix: null,
      },
      {
        model: "gemini-2.5-pro",
        provider: "gemini",
        account_id: "claude.json",
        account_prefix: null,
      },
    ]);
  });

  it("updates auth file status and fields", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));
    const client = createClient(fetchMock);

    await client.updateAuthFileStatus("codex.json", true);
    await client.updateAuthFileFields("codex.json", {
      prefix: "team-a",
      proxy_url: "socks5://127.0.0.1:1080",
      priority: 10,
      note: "primary",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8317/v0/management/auth-files/status",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "codex.json", disabled: true }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8317/v0/management/auth-files/fields",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          name: "codex.json",
          prefix: "team-a",
          proxy_url: "socks5://127.0.0.1:1080",
          priority: 10,
          note: "primary",
        }),
      })
    );
  });

  it("gets provider-specific OAuth URLs and maps login status", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "ok", url: "https://oauth", state: "gem-1" })
    );

    const result = await createClient(fetchMock).getAuthUrl("gemini", {
      isWebUi: true,
      projectId: "project-1",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:8317/v0/management/gemini-cli-auth-url?is_webui=true&project_id=project-1"
    );
    expect(result).toEqual({
      provider: "gemini",
      status: "success",
      auth_url: "https://oauth",
      device_code: null,
      expires_at: null,
      message: null,
    });
  });

  it("maps auth status errors", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "error", error: "Authentication failed" })
    );

    const result = await createClient(fetchMock).getAuthStatus("state-1");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:8317/v0/management/get-auth-status?state=state-1"
    );
    expect(result.status).toBe("failed");
    expect(result.message).toBe("Authentication failed");
  });

  it("calls the official api-call endpoint for outbound checks", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status_code: 200, header: { "content-type": "application/json" }, body: "{}" })
    );

    const result = await createClient(fetchMock).apiCall({
      authIndex: "auth-1",
      method: "GET",
      url: "https://api.example.com/v1/models",
      headers: { Authorization: "Bearer $TOKEN$" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8317/v0/management/api-call",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          auth_index: "auth-1",
          method: "GET",
          url: "https://api.example.com/v1/models",
          header: { Authorization: "Bearer $TOKEN$" },
          body: undefined,
        }),
      })
    );
    expect(result).toEqual({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  });

  it("blocks unsafe api-call targets before CPA receives the request", async () => {
    await expect(
      createClient(fetchMock).apiCall({
        authIndex: "auth-1",
        method: "GET",
        url: "http://localhost:3000/internal",
      })
    ).rejects.toMatchObject({
      name: "CliproxyApiClientError",
      message: "Loopback addresses are not allowed",
    } satisfies Partial<CliproxyApiClientError>);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tests proxy and management endpoints separately", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const client = createClient(fetchMock);

    const proxy = await client.testEndpoint("proxy");
    const management = await client.testEndpoint("management");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:8317/v1/models");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://localhost:8317/v0/management/auth-files");
    expect(proxy.ok).toBe(true);
    expect(management.ok).toBe(true);
    expect(management.status_code).toBe(401);
  });

  it("reports unsupported dedicated outbound proxy tests", async () => {
    const result = await createClient(fetchMock).testEndpoint("outbound_proxy");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("does not expose a dedicated outbound proxy test endpoint");
  });

  it("throws client errors for non-OK JSON requests", async () => {
    fetchMock.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));

    await expect(createClient(fetchMock).listAuthFiles()).rejects.toMatchObject({
      name: "CliproxyApiClientError",
      statusCode: 403,
      responseBody: "forbidden",
    } satisfies Partial<CliproxyApiClientError>);
  });
});
