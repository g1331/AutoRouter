import { getPrimaryProviderByCapabilities, type RouteCapability } from "@/lib/route-capabilities";
import { createLogger } from "@/lib/utils/logger";
import {
  normalizeModelDiscoveryConfig,
  parseUpstreamModelCatalog,
  type UpstreamModelCatalogEntry,
  type UpstreamModelCatalogFetchStatus,
  type UpstreamModelDiscoveryConfig,
  type UpstreamModelDiscoveryMode,
} from "./upstream-model-rules";

const log = createLogger("upstream-model-discovery");

const FETCH_TIMEOUT_MS = 12_000;
const ANTHROPIC_API_VERSION = "2023-06-01";
const LITELLM_MODEL_CATALOG_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

type DiscoveryProvider = "openai" | "anthropic" | "google";

export interface UpstreamModelDiscoveryTarget {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  routeCapabilities: RouteCapability[];
  modelDiscovery: UpstreamModelDiscoveryConfig | null;
}

export interface UpstreamModelCatalogPersistencePatch {
  modelCatalog: UpstreamModelCatalogEntry[] | null;
  modelCatalogUpdatedAt: Date | null;
  modelCatalogLastFailedAt: Date | null;
  modelCatalogLastStatus: UpstreamModelCatalogFetchStatus;
  modelCatalogLastError: string | null;
}

export interface UpstreamModelCatalogRefreshResult extends UpstreamModelCatalogPersistencePatch {
  upstreamId: string;
  upstreamName: string;
  resolvedMode: UpstreamModelDiscoveryMode;
  fallbackUsed: boolean;
}

interface DiscoveryRequest {
  url: string;
  init: RequestInit;
}

interface DiscoveryExecutionResult {
  catalog: UpstreamModelCatalogEntry[] | null;
  resolvedMode: UpstreamModelDiscoveryMode;
  fallbackUsed: boolean;
}

function normalizeBaseUrl(baseUrl: string): URL {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url;
}

function buildRelativeDiscoveryBase(baseUrl: string): string {
  const url = normalizeBaseUrl(baseUrl);
  url.pathname = url.pathname === "/" ? "/" : `${url.pathname}/`;
  return url.toString();
}

function buildDefaultDiscoveryUrl(baseUrl: string, defaultPath: string): string {
  const url = normalizeBaseUrl(baseUrl);

  // A non-root pathname means the upstream already points at an API root such as
  // /codex/v1 or /v1beta/openai, so discovery must append the relative models resource.
  if (url.pathname === "/") {
    url.pathname = defaultPath;
    return url.toString();
  }

  return new URL("models", buildRelativeDiscoveryBase(baseUrl)).toString();
}

function resolveDiscoveryProvider(
  routeCapabilities: readonly RouteCapability[]
): DiscoveryProvider {
  return getPrimaryProviderByCapabilities(routeCapabilities) ?? "openai";
}

function resolveCustomDiscoveryUrl(baseUrl: string, customEndpoint: string | null): string {
  if (!customEndpoint) {
    throw new Error("Custom discovery mode requires a custom endpoint");
  }

  return new URL(customEndpoint, buildRelativeDiscoveryBase(baseUrl)).toString();
}

function buildDiscoveryRequest(
  target: Pick<UpstreamModelDiscoveryTarget, "baseUrl" | "apiKey" | "routeCapabilities">,
  config: UpstreamModelDiscoveryConfig
): DiscoveryRequest {
  const provider = resolveDiscoveryProvider(target.routeCapabilities);

  if (config.mode === "litellm") {
    const url = config.customEndpoint
      ? resolveCustomDiscoveryUrl(target.baseUrl, config.customEndpoint)
      : LITELLM_MODEL_CATALOG_URL;
    return {
      url,
      init: {
        method: "GET",
        redirect: "error",
      },
    };
  }

  if (config.mode === "gemini_native") {
    const baseUrl = config.customEndpoint
      ? resolveCustomDiscoveryUrl(target.baseUrl, config.customEndpoint)
      : buildDefaultDiscoveryUrl(target.baseUrl, "/v1beta/models");
    const url = new URL(baseUrl);
    url.searchParams.set("key", target.apiKey);
    return {
      url: url.toString(),
      init: {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        redirect: "error",
      },
    };
  }

  const defaultPathByMode: Record<
    Exclude<UpstreamModelDiscoveryMode, "gemini_native" | "litellm">,
    string
  > = {
    openai_compatible: "/v1/models",
    anthropic_native: "/v1/models",
    gemini_openai_compatible: "/v1beta/openai/models",
    custom: "/v1/models",
  };

  const url =
    config.mode === "custom"
      ? resolveCustomDiscoveryUrl(target.baseUrl, config.customEndpoint)
      : buildDefaultDiscoveryUrl(target.baseUrl, defaultPathByMode[config.mode]);

  const headers: HeadersInit = {
    Accept: "application/json",
  };

  // Custom discovery endpoints do not declare their own auth scheme, so we derive the
  // closest compatible header shape from the upstream's primary route capability.
  const usesAnthropicHeaders = config.mode === "anthropic_native" || provider === "anthropic";
  if (usesAnthropicHeaders) {
    headers["x-api-key"] = target.apiKey;
    headers["anthropic-version"] = ANTHROPIC_API_VERSION;
  } else {
    headers.Authorization = `Bearer ${target.apiKey}`;
  }

  return {
    url,
    init: {
      method: "GET",
      headers,
      redirect: "error",
    },
  };
}

async function fetchJsonWithTimeout(request: DiscoveryRequest): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(request.url, {
      ...request.init,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${request.url}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeCatalogEntries(
  models: string[],
  source: UpstreamModelCatalogEntry["source"]
): UpstreamModelCatalogEntry[] | null {
  return parseUpstreamModelCatalog(models.map((model) => ({ model, source })));
}

function parseOpenAiCompatibleCatalog(payload: unknown): UpstreamModelCatalogEntry[] | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    return null;
  }

  const models = data
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }

      if (!entry || typeof entry !== "object") {
        return null;
      }

      const id = (entry as { id?: unknown }).id;
      return typeof id === "string" ? id : null;
    })
    .filter((value): value is string => typeof value === "string");

  return normalizeCatalogEntries(models, "native");
}

function parseGeminiNativeCatalog(payload: unknown): UpstreamModelCatalogEntry[] | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const models = (payload as { models?: unknown }).models;
  if (!Array.isArray(models)) {
    return null;
  }

  const normalizedModels = models
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const rawName = (entry as { name?: unknown }).name;
      if (typeof rawName !== "string") {
        return null;
      }

      return rawName.startsWith("models/") ? rawName.slice("models/".length) : rawName;
    })
    .filter((value): value is string => typeof value === "string");

  return normalizeCatalogEntries(normalizedModels, "native");
}

function parseLiteLlmCatalog(payload: unknown): UpstreamModelCatalogEntry[] | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  return normalizeCatalogEntries(Object.keys(payload as Record<string, unknown>), "inferred");
}

function parseDiscoveryPayload(
  payload: unknown,
  mode: UpstreamModelDiscoveryMode
): UpstreamModelCatalogEntry[] | null {
  if (mode === "gemini_native") {
    return parseGeminiNativeCatalog(payload);
  }

  if (mode === "litellm") {
    return parseLiteLlmCatalog(payload);
  }

  return parseOpenAiCompatibleCatalog(payload);
}

async function fetchCatalogForMode(
  target: UpstreamModelDiscoveryTarget,
  config: UpstreamModelDiscoveryConfig,
  mode: UpstreamModelDiscoveryMode
): Promise<UpstreamModelCatalogEntry[] | null> {
  const payload = await fetchJsonWithTimeout(
    buildDiscoveryRequest(target, {
      ...config,
      mode,
    })
  );

  const catalog = parseDiscoveryPayload(payload, mode);
  if (!catalog || catalog.length === 0) {
    throw new Error(`Discovery mode '${mode}' returned no valid model entries`);
  }

  return catalog;
}

async function executeDiscovery(
  target: UpstreamModelDiscoveryTarget
): Promise<DiscoveryExecutionResult> {
  const config = normalizeModelDiscoveryConfig(target.modelDiscovery);
  if (!config) {
    throw new Error("Model discovery is not configured for this upstream");
  }

  try {
    return {
      catalog: await fetchCatalogForMode(target, config, config.mode),
      resolvedMode: config.mode,
      fallbackUsed: false,
    };
  } catch (error) {
    if (!config.enableLiteLlmFallback || config.mode === "litellm") {
      throw error;
    }

    try {
      // LiteLLM is treated as inferred metadata only, so fallback fills the catalog without
      // pretending the upstream itself authoritatively exposed these models.
      const catalog = await fetchCatalogForMode(target, config, "litellm");
      log.warn(
        {
          upstreamId: target.id,
          upstreamName: target.name,
          primaryMode: config.mode,
          err: error,
        },
        "native model discovery failed; using LiteLLM fallback catalog"
      );
      return {
        catalog,
        resolvedMode: config.mode,
        fallbackUsed: true,
      };
    } catch (fallbackError) {
      const primaryMessage = error instanceof Error ? error.message : String(error);
      const fallbackMessage =
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(`${primaryMessage}; LiteLLM fallback failed: ${fallbackMessage}`);
    }
  }
}

export async function discoverUpstreamModels(
  target: UpstreamModelDiscoveryTarget
): Promise<UpstreamModelCatalogEntry[] | null> {
  return (await executeDiscovery(target)).catalog;
}

export async function refreshUpstreamModelCatalog(
  target: UpstreamModelDiscoveryTarget
): Promise<UpstreamModelCatalogRefreshResult> {
  try {
    const discovered = await executeDiscovery(target);
    const refreshedAt = new Date();
    return {
      upstreamId: target.id,
      upstreamName: target.name,
      resolvedMode: discovered.resolvedMode,
      fallbackUsed: discovered.fallbackUsed,
      modelCatalog: discovered.catalog,
      modelCatalogUpdatedAt: refreshedAt,
      modelCatalogLastFailedAt: null,
      modelCatalogLastStatus: "success",
      modelCatalogLastError: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedAt = new Date();
    log.warn(
      { upstreamId: target.id, upstreamName: target.name, err: error },
      "model discovery failed"
    );
    return {
      upstreamId: target.id,
      upstreamName: target.name,
      resolvedMode:
        normalizeModelDiscoveryConfig(target.modelDiscovery)?.mode ?? "openai_compatible",
      fallbackUsed: false,
      modelCatalog: null,
      modelCatalogUpdatedAt: null,
      modelCatalogLastFailedAt: failedAt,
      modelCatalogLastStatus: "failure",
      modelCatalogLastError: message,
    };
  }
}
