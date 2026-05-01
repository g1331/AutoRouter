import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockValidateAdminAuth = vi.fn(() => true);
const mockListConnections = vi.fn();
const mockCreateConnection = vi.fn();
const mockUpdateConnection = vi.fn();
const mockGetDefaultConnection = vi.fn();
const mockGetConnectionWithSecrets = vi.fn();
const mockCreateClient = vi.fn();
const mockBuildPoolPresets = vi.fn();
const mockBuildAccountPreset = vi.fn();

const connection = {
  id: "conn-1",
  name: "local-cpa",
  mode: "external" as const,
  baseUrl: "http://localhost:8317/v1",
  clientApiKeyMasked: "sk***ient",
  clientApiKeyConfigured: true,
  managementUrl: "http://localhost:8317/v0/management",
  managementSecretMasked: "mg***cret",
  managementSecretConfigured: true,
  outboundProxyUrl: "socks5://127.0.0.1:1080",
  isEnabled: true,
  isDefault: true,
  lastTestedAt: null,
  lastStatus: "untested" as const,
  lastError: null,
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-01T00:00:00.000Z"),
};

const connectionWithSecrets = {
  ...connection,
  clientApiKey: "sk-cpa-client",
  managementSecret: "mgmt-secret",
};

const client = {
  testEndpoint: vi.fn(),
  listAuthFiles: vi.fn(),
  listAuthFileModels: vi.fn(),
  updateAuthFileStatus: vi.fn(),
  updateAuthFileFields: vi.fn(),
  getAuthUrl: vi.fn(),
  getAuthStatus: vi.fn(),
};

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: mockValidateAdminAuth,
}));

vi.mock("@/lib/services/upstream-service", () => {
  class MockConnectionNotFoundError extends Error {}
  class MockClientError extends Error {
    statusCode: number | null = null;
    responseBody: string | null = null;
  }

  return {
    listCliproxyApiConnections: mockListConnections,
    createCliproxyApiConnection: mockCreateConnection,
    updateCliproxyApiConnection: mockUpdateConnection,
    getDefaultCliproxyApiConnection: mockGetDefaultConnection,
    getCliproxyApiConnectionWithSecrets: mockGetConnectionWithSecrets,
    createCliproxyApiManagementClient: mockCreateClient,
    buildCliproxyApiUpstreamPresets: mockBuildPoolPresets,
    buildCliproxyApiAccountUpstreamPreset: mockBuildAccountPreset,
    CliproxyApiConnectionNotFoundError: MockConnectionNotFoundError,
    CliproxyApiClientError: MockClientError,
  };
});

describe("admin cliproxyapi routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateAdminAuth.mockReturnValue(true);
    mockListConnections.mockResolvedValue([connection]);
    mockCreateConnection.mockResolvedValue(connection);
    mockUpdateConnection.mockResolvedValue(connection);
    mockGetDefaultConnection.mockResolvedValue(connection);
    mockGetConnectionWithSecrets.mockResolvedValue(connectionWithSecrets);
    mockCreateClient.mockReturnValue(client);
    client.testEndpoint.mockResolvedValue({
      endpoint: "management",
      ok: true,
      status_code: 200,
      latency_ms: 12,
      message: "Connection succeeded",
      tested_at: "2026-05-01T00:00:00.000Z",
    });
    client.listAuthFiles.mockResolvedValue([
      { id: "auth-1", provider: "codex", name: "codex.json" },
    ]);
    client.listAuthFileModels.mockResolvedValue([{ model: "gpt-5-codex", provider: "codex" }]);
    client.getAuthUrl.mockResolvedValue({
      provider: "codex",
      status: "success",
      auth_url: "https://oauth",
    });
    client.getAuthStatus.mockResolvedValue({ provider: "codex", status: "pending" });
    mockBuildPoolPresets.mockReturnValue([{ id: "codex", base_url: "http://localhost:8317/v1" }]);
    mockBuildAccountPreset.mockReturnValue({
      id: "codex",
      name: "CLIProxyAPI codex.json Account",
      model_rules: [{ type: "exact", value: "gpt-5-codex" }],
    });
  });

  it("rejects unauthorized config access", async () => {
    const { GET } = await import("@/app/api/admin/cliproxyapi/config/route");
    mockValidateAdminAuth.mockReturnValueOnce(false);

    const response = await GET(new NextRequest("http://localhost/api/admin/cliproxyapi/config"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns masked connection config without plaintext secrets", async () => {
    const { GET } = await import("@/app/api/admin/cliproxyapi/config/route");

    const response = await GET(new NextRequest("http://localhost/api/admin/cliproxyapi/config"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items[0]).toEqual(
      expect.objectContaining({
        id: "conn-1",
        client_api_key_masked: "sk***ient",
        client_api_key_configured: true,
        management_secret_masked: "mg***cret",
        management_secret_configured: true,
      })
    );
    expect(JSON.stringify(data)).not.toContain("mgmt-secret");
    expect(JSON.stringify(data)).not.toContain("sk-cpa-client");
  });

  it("creates connection config from POST body", async () => {
    const { POST } = await import("@/app/api/admin/cliproxyapi/config/route");

    const response = await POST(
      new NextRequest("http://localhost/api/admin/cliproxyapi/config", {
        method: "POST",
        body: JSON.stringify({
          name: "local-cpa",
          mode: "external",
          base_url: "http://localhost:8317/v1",
          client_api_key: "sk-cpa-client",
          management_url: "http://localhost:8317/v0/management",
          management_secret: "mgmt-secret",
          outbound_proxy_url: "socks5://127.0.0.1:1080",
          is_default: true,
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(mockCreateConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        clientApiKey: "sk-cpa-client",
        managementSecret: "mgmt-secret",
      })
    );
  });

  it("tests a selected connection endpoint", async () => {
    const { POST } = await import("@/app/api/admin/cliproxyapi/status/route");

    const response = await POST(
      new NextRequest("http://localhost/api/admin/cliproxyapi/status", {
        method: "POST",
        body: JSON.stringify({ connection_id: "conn-1", endpoint: "management" }),
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetConnectionWithSecrets).toHaveBeenCalledWith("conn-1");
    expect(client.testEndpoint).toHaveBeenCalledWith("management");
    expect(mockUpdateConnection).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ lastStatus: "success", lastError: null })
    );
    expect(data.result.ok).toBe(true);
  });

  it("lists auth files and models through the service client", async () => {
    const authFilesRoute = await import("@/app/api/admin/cliproxyapi/auth-files/route");
    const modelsRoute = await import("@/app/api/admin/cliproxyapi/auth-files/models/route");

    const authFilesResponse = await authFilesRoute.GET(
      new NextRequest("http://localhost/api/admin/cliproxyapi/auth-files?connection_id=conn-1")
    );
    const modelsResponse = await modelsRoute.GET(
      new NextRequest(
        "http://localhost/api/admin/cliproxyapi/auth-files/models?connection_id=conn-1&name=codex.json"
      )
    );

    expect(await authFilesResponse.json()).toEqual({
      items: [{ id: "auth-1", provider: "codex", name: "codex.json" }],
    });
    expect(client.listAuthFileModels).toHaveBeenCalledWith("codex.json");
    expect(await modelsResponse.json()).toEqual({
      items: [{ model: "gpt-5-codex", provider: "codex" }],
    });
  });

  it("updates auth file status and fields", async () => {
    const { PATCH } = await import("@/app/api/admin/cliproxyapi/auth-files/route");

    const response = await PATCH(
      new NextRequest("http://localhost/api/admin/cliproxyapi/auth-files", {
        method: "PATCH",
        body: JSON.stringify({
          connection_id: "conn-1",
          name: "codex.json",
          disabled: true,
          fields: { prefix: "team-a", priority: 10 },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(client.updateAuthFileStatus).toHaveBeenCalledWith("codex.json", true);
    expect(client.updateAuthFileFields).toHaveBeenCalledWith("codex.json", {
      prefix: "team-a",
      priority: 10,
    });
  });

  it("gets OAuth URL and polls OAuth status", async () => {
    const { GET } = await import("@/app/api/admin/cliproxyapi/oauth/route");

    const urlResponse = await GET(
      new NextRequest(
        "http://localhost/api/admin/cliproxyapi/oauth?connection_id=conn-1&provider=codex&is_webui=true"
      )
    );
    const statusResponse = await GET(
      new NextRequest("http://localhost/api/admin/cliproxyapi/oauth?connection_id=conn-1&state=abc")
    );

    expect(client.getAuthUrl).toHaveBeenCalledWith("codex", { isWebUi: true, projectId: null });
    expect(await urlResponse.json()).toEqual({
      provider: "codex",
      status: "success",
      auth_url: "https://oauth",
    });
    expect(client.getAuthStatus).toHaveBeenCalledWith("abc");
    expect(await statusResponse.json()).toEqual({ provider: "codex", status: "pending" });
  });

  it("returns validation errors for malformed OAuth requests", async () => {
    const { GET } = await import("@/app/api/admin/cliproxyapi/oauth/route");

    const response = await GET(new NextRequest("http://localhost/api/admin/cliproxyapi/oauth"));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("provider or state is required");
  });

  it("returns OAuth pool and fixed-account upstream presets", async () => {
    const { GET, POST } = await import("@/app/api/admin/cliproxyapi/presets/route");

    const poolResponse = await GET(
      new NextRequest("http://localhost/api/admin/cliproxyapi/presets?connection_id=conn-1")
    );
    const accountResponse = await POST(
      new NextRequest("http://localhost/api/admin/cliproxyapi/presets", {
        method: "POST",
        body: JSON.stringify({
          connection_id: "conn-1",
          provider: "codex",
          account_name: "codex.json",
          account_prefix: "main",
          models: ["gpt-5-codex"],
        }),
      })
    );

    expect(mockBuildPoolPresets).toHaveBeenCalledWith("conn-1", "http://localhost:8317/v1");
    expect(await poolResponse.json()).toEqual({
      items: [{ id: "codex", base_url: "http://localhost:8317/v1" }],
    });
    expect(mockBuildAccountPreset).toHaveBeenCalledWith({
      connectionId: "conn-1",
      connectionBaseUrl: "http://localhost:8317/v1",
      provider: "codex",
      accountName: "codex.json",
      accountPrefix: "main",
      models: ["gpt-5-codex"],
    });
    expect(await accountResponse.json()).toEqual({
      id: "codex",
      name: "CLIProxyAPI codex.json Account",
      model_rules: [{ type: "exact", value: "gpt-5-codex" }],
    });
  });
});
