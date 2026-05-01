import type {
  CliproxyApiAccount,
  CliproxyApiConnectionTestResult,
  CliproxyApiEndpointKind,
  CliproxyApiModel,
  CliproxyApiOauthLoginResponse,
  CliproxyApiOauthLoginStatus,
  CliproxyApiProvider,
} from "@/types/api";
import { isUrlSafe, resolveAndValidateHostname } from "./upstream-ssrf-validator";

const DEFAULT_TIMEOUT_MS = 10_000;

export interface CliproxyApiClientConfig {
  baseUrl: string;
  clientApiKey: string | null;
  managementUrl: string;
  managementSecret: string | null;
  outboundProxyUrl: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface CliproxyApiAuthFileFieldUpdate {
  prefix?: string | null;
  proxy_url?: string | null;
  headers?: Record<string, string> | null;
  priority?: number | null;
  note?: string | null;
}

export interface CliproxyApiAuthUrlOptions {
  isWebUi?: boolean;
  projectId?: string | null;
}

export interface CliproxyApiApiCallInput {
  authIndex: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
}

export interface CliproxyApiApiCallResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Error raised when a CLIProxyAPI request fails or returns invalid data.
 */
export class CliproxyApiClientError extends Error {
  statusCode: number | null;
  responseBody: string | null;

  constructor(
    message: string,
    statusCode: number | null = null,
    responseBody: string | null = null
  ) {
    super(message);
    this.name = "CliproxyApiClientError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function getBoolean(record: JsonRecord, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function getNumber(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeBaseUrl(value: string): string {
  return new URL(value).toString().replace(/\/$/, "");
}

function appendPath(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}/${path.replace(/^\/+/, "")}`;
}

function mapProvider(value: string | null): CliproxyApiProvider {
  // CPA returns provider labels from multiple protocol surfaces; normalize them to AutoRouter's three supported OAuth pools.
  if (value === "claude" || value === "anthropic") return "claude";
  if (value === "gemini" || value === "gemini-cli" || value === "aistudio") return "gemini";
  return "codex";
}

function mapLoginStatus(value: string | null): CliproxyApiOauthLoginStatus {
  // CPA uses `ok` and `wait` in OAuth polling responses; API consumers receive stable UI-facing statuses.
  if (value === "ok" || value === "success") return "success";
  if (value === "error" || value === "failed") return "failed";
  if (value === "expired") return "expired";
  return "pending";
}

function buildAuthUrlPath(provider: CliproxyApiProvider): string {
  switch (provider) {
    case "claude":
      return "anthropic-auth-url";
    case "gemini":
      return "gemini-cli-auth-url";
    case "codex":
      return "codex-auth-url";
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new CliproxyApiClientError(
      `CLIProxyAPI request failed with status ${response.status}`,
      response.status,
      text || null
    );
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CliproxyApiClientError("CLIProxyAPI returned invalid JSON", response.status, text);
  }
}

async function assertSafeOutboundUrl(url: string): Promise<void> {
  const urlSafety = isUrlSafe(url);
  if (!urlSafety.safe) {
    throw new CliproxyApiClientError(urlSafety.reason ?? "Outbound URL is not allowed");
  }

  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname.match(/^[\d.:]+$/) && hostname !== "localhost") {
    const dnsSafety = await resolveAndValidateHostname(hostname);
    if (!dnsSafety.safe) {
      throw new CliproxyApiClientError(
        dnsSafety.reason ?? "Outbound URL resolves to a blocked address"
      );
    }
  }
}

/**
 * Thin client for CLIProxyAPI management endpoints used by AutoRouter admin routes.
 */
export class CliproxyApiManagementClient {
  private readonly baseUrl: string;
  private readonly clientApiKey: string | null;
  private readonly managementUrl: string;
  private readonly managementSecret: string | null;
  private readonly outboundProxyUrl: string | null;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: CliproxyApiClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.clientApiKey = config.clientApiKey;
    this.managementUrl = normalizeBaseUrl(config.managementUrl);
    this.managementSecret = config.managementSecret;
    this.outboundProxyUrl = config.outboundProxyUrl;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async listAuthFiles(): Promise<CliproxyApiAccount[]> {
    const data = await this.managementRequest("auth-files");
    if (!isRecord(data) || !Array.isArray(data.files)) return [];
    return data.files.filter(isRecord).map((file) => {
      const provider = mapProvider(getString(file, "provider") ?? getString(file, "type"));
      const id =
        getString(file, "id") ??
        getString(file, "auth_index") ??
        getString(file, "name") ??
        "unknown";
      const name = getString(file, "name") ?? id;
      return {
        id,
        provider,
        name,
        prefix: getString(file, "prefix"),
        enabled: !(getBoolean(file, "disabled") ?? false),
        model_count: getNumber(file, "model_count") ?? 0,
        status: getString(file, "status") ?? "unknown",
        error: getString(file, "error"),
        cooldown_until: getString(file, "cooldown_until"),
        metadata: file,
      };
    });
  }

  async listAuthFileModels(name: string): Promise<CliproxyApiModel[]> {
    const params = new URLSearchParams({ name });
    const data = await this.managementRequest(`auth-files/models?${params.toString()}`);
    if (!isRecord(data) || !Array.isArray(data.models)) return [];
    return data.models.filter(isRecord).map((model) => ({
      model:
        getString(model, "id") ??
        getString(model, "model") ??
        getString(model, "name") ??
        "unknown",
      provider: mapProvider(getString(model, "type") ?? getString(model, "provider")),
      account_id: name,
      account_prefix: null,
    }));
  }

  async updateAuthFileStatus(name: string, disabled: boolean): Promise<void> {
    await this.managementRequest("auth-files/status", {
      method: "PATCH",
      body: JSON.stringify({ name, disabled }),
    });
  }

  async updateAuthFileFields(name: string, fields: CliproxyApiAuthFileFieldUpdate): Promise<void> {
    await this.managementRequest("auth-files/fields", {
      method: "PATCH",
      body: JSON.stringify({ name, ...fields }),
    });
  }

  async getAuthUrl(
    provider: CliproxyApiProvider,
    options: CliproxyApiAuthUrlOptions = {}
  ): Promise<CliproxyApiOauthLoginResponse> {
    const params = new URLSearchParams();
    if (options.isWebUi) params.set("is_webui", "true");
    if (provider === "gemini" && options.projectId) params.set("project_id", options.projectId);

    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    const data = await this.managementRequest(`${buildAuthUrlPath(provider)}${suffix}`);
    const record = isRecord(data) ? data : {};
    return {
      provider,
      status: mapLoginStatus(getString(record, "status")),
      auth_url: getString(record, "url") ?? getString(record, "auth_url"),
      device_code: getString(record, "device_code"),
      expires_at: getString(record, "expires_at"),
      message: getString(record, "message") ?? getString(record, "error"),
    };
  }

  async getAuthStatus(state: string): Promise<CliproxyApiOauthLoginResponse> {
    const params = new URLSearchParams({ state });
    const data = await this.managementRequest(`get-auth-status?${params.toString()}`);
    const record = isRecord(data) ? data : {};
    return {
      // CPA status polling is keyed by state only and does not echo the provider; callers keep the provider context.
      provider: "codex",
      status: mapLoginStatus(getString(record, "status")),
      auth_url: null,
      device_code: null,
      expires_at: null,
      message: getString(record, "message") ?? getString(record, "error"),
    };
  }

  async apiCall(input: CliproxyApiApiCallInput): Promise<CliproxyApiApiCallResult> {
    // `/api-call` asks CPA to perform arbitrary outbound HTTP requests, so AutoRouter applies its own SSRF gate first.
    await assertSafeOutboundUrl(input.url);

    const data = await this.managementRequest("api-call", {
      method: "POST",
      body: JSON.stringify({
        auth_index: input.authIndex,
        method: input.method,
        url: input.url,
        header: input.headers ?? {},
        body: input.body ?? undefined,
      }),
    });
    const record = isRecord(data) ? data : {};
    const headers = isRecord(record.header)
      ? Object.fromEntries(
          Object.entries(record.header).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        )
      : {};
    return {
      statusCode: getNumber(record, "status_code") ?? 0,
      headers,
      body: getString(record, "body") ?? "",
    };
  }

  async testEndpoint(endpoint: CliproxyApiEndpointKind): Promise<CliproxyApiConnectionTestResult> {
    const startedAt = Date.now();
    try {
      const statusCode = await this.performEndpointTest(endpoint);
      return {
        endpoint,
        ok: statusCode >= 200 && statusCode < 500,
        status_code: statusCode,
        latency_ms: Date.now() - startedAt,
        message:
          statusCode >= 200 && statusCode < 500 ? "Connection succeeded" : "Connection failed",
        tested_at: new Date().toISOString(),
      };
    } catch (error) {
      return {
        endpoint,
        ok: false,
        status_code: error instanceof CliproxyApiClientError ? error.statusCode : null,
        latency_ms: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Connection failed",
        tested_at: new Date().toISOString(),
      };
    }
  }

  private async managementRequest(path: string, init: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body) headers.set("Content-Type", "application/json");
    if (this.managementSecret) {
      headers.set("Authorization", `Bearer ${this.managementSecret}`);
      headers.set("X-Management-Key", this.managementSecret);
    }

    const response = await this.fetchWithTimeout(appendPath(this.managementUrl, path), {
      ...init,
      headers,
    });
    return parseJsonResponse(response);
  }

  private async performEndpointTest(endpoint: CliproxyApiEndpointKind): Promise<number> {
    if (endpoint === "management") {
      const response = await this.fetchWithTimeout(appendPath(this.managementUrl, "auth-files"), {
        headers: this.managementHeaders(),
      });
      return response.status;
    }

    if (endpoint === "outbound_proxy") {
      if (!this.outboundProxyUrl) {
        throw new CliproxyApiClientError("Outbound proxy URL is not configured");
      }
      // Official CPA exposes `/api-call` for real outbound checks, not a standalone proxy health endpoint.
      throw new CliproxyApiClientError(
        "CLIProxyAPI does not expose a dedicated outbound proxy test endpoint; use api-call with an auth file instead"
      );
    }

    const response = await this.fetchWithTimeout(appendPath(this.baseUrl, "models"), {
      headers: this.proxyHeaders(),
    });
    return response.status;
  }

  private managementHeaders(): Headers {
    const headers = new Headers({ Accept: "application/json" });
    if (this.managementSecret) {
      headers.set("Authorization", `Bearer ${this.managementSecret}`);
      headers.set("X-Management-Key", this.managementSecret);
    }
    return headers;
  }

  private proxyHeaders(): Headers {
    const headers = new Headers({ Accept: "application/json" });
    if (this.clientApiKey) headers.set("Authorization", `Bearer ${this.clientApiKey}`);
    return headers;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new CliproxyApiClientError("CLIProxyAPI request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Create a CLIProxyAPI management client with injectable fetch support for tests.
 */
export function createCliproxyApiManagementClient(
  config: CliproxyApiClientConfig
): CliproxyApiManagementClient {
  return new CliproxyApiManagementClient(config);
}
