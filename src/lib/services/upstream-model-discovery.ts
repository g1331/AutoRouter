import {
  getPrimaryProviderByCapabilities,
  resolveRouteCapabilities,
  type RouteCapability,
} from "@/lib/route-capabilities";
import { createLogger } from "@/lib/utils/logger";
import {
  inferDefaultModelDiscoveryConfig,
  normalizeModelCatalogSource,
  normalizeUpstreamModelDiscoveryConfig,
  type UpstreamModelCatalogEntry,
  type UpstreamModelCatalogStatus,
  type UpstreamModelDiscoveryConfig,
} from "./upstream-model-types";

const log = createLogger("upstream-model-discovery");

const LITELLM_MODEL_CATALOG_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const DEFAULT_DISCOVERY_TIMEOUT_MS = 10_000;

export interface RefreshUpstreamModelCatalogInput {
  baseUrl: string;
  apiKey: string;
  routeCapabilities: RouteCapability[] | string[] | null | undefined;
  modelDiscovery?: Partial<UpstreamModelDiscoveryConfig> | null;
  previousCatalog?: UpstreamModelCatalogEntry[] | null;
  timeoutMs?: number;
}

export interface RefreshUpstreamModelCatalogResult {
  modelDiscovery: UpstreamModelDiscoveryConfig | null;
  modelCatalog: UpstreamModelCatalogEntry[] | null;
  modelCatalogUpdatedAt: Date | null;
  modelCatalogLastStatus: UpstreamModelCatalogStatus;
  modelCatalogLastError: string | null;
  modelCatalogLastFailedAt: Date | null;
}

export interface DiscoveryRequest {
  url: string;
  headers: Record<string, string>;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function stripTrailingModelsPath(pathname: string): string {
  if (pathname.endsWith("/models")) {
    return pathname.slice(0, -"/models".length) || "/";
  }
  return pathname || "/";
}

export function normalizeApiRoot(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.hash = "";
  url.search = "";
  url.pathname = stripTrailingModelsPath(stripTrailingSlash(url.pathname || "/"));
  return url.toString().replace(/\/$/, url.pathname === "/" ? "" : "");
}

export function buildUpstreamModelDiscoveryRequest(
  input: RefreshUpstreamModelCatalogInput
): DiscoveryRequest {
  const normalizedCapabilities = resolveRouteCapabilities(input.routeCapabilities);
  const inferredConfig = inferDefaultModelDiscoveryConfig(normalizedCapabilities);
  const discoveryConfig = input.modelDiscovery
    ? normalizeUpstreamModelDiscoveryConfig(
        input.modelDiscovery,
        inferredConfig?.mode ?? "openai_compatible"
      )
    : inferredConfig;

  if (!discoveryConfig) {
    throw new Error("Unable to infer model discovery mode from route capabilities");
  }

  const apiRoot = normalizeApiRoot(input.baseUrl);
  const provider = getPrimaryProviderByCapabilities(normalizedCapabilities);
  const headers: Record<string, string> = {};
  let requestUrl: URL;

  switch (discoveryConfig.mode) {
    case "anthropic_native": {
      requestUrl = new URL("models", `${apiRoot}/`);
      headers["x-api-key"] = input.apiKey;
      headers["anthropic-version"] = "2023-06-01";
      break;
    }
    case "gemini_native": {
      requestUrl = new URL("models", `${apiRoot}/`);
      requestUrl.searchParams.set("key", input.apiKey);
      break;
    }
    case "custom": {
      const customEndpoint = discoveryConfig.customEndpoint?.trim();
      if (!customEndpoint) {
        throw new Error("Custom discovery endpoint is required when mode is custom");
      }

      requestUrl = new URL(customEndpoint, `${apiRoot}/`);
      if (provider === "anthropic") {
        headers["x-api-key"] = input.apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else if (provider === "google") {
        requestUrl.searchParams.set("key", input.apiKey);
      } else {
        headers["Authorization"] = `Bearer ${input.apiKey}`;
      }
      break;
    }
    case "litellm": {
      requestUrl = new URL(LITELLM_MODEL_CATALOG_URL);
      break;
    }
    case "gemini_openai_compatible":
    case "openai_compatible":
    default: {
      requestUrl = new URL("models", `${apiRoot}/`);
      headers["Authorization"] = `Bearer ${input.apiKey}`;
      break;
    }
  }

  return {
    url: requestUrl.toString(),
    headers,
  };
}

function normalizeCatalogEntries(
  models: string[],
  source: "native" | "inferred"
): UpstreamModelCatalogEntry[] {
  const unique = new Set<string>();
  for (const model of models) {
    const normalized = model.trim();
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique]
    .sort((left, right) => left.localeCompare(right))
    .map((model) => ({
      model,
      source: normalizeModelCatalogSource(source),
    }));
}

function parseModelEntryName(entry: unknown): string | null {
  if (typeof entry === "string") {
    return entry;
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const value =
    ("id" in entry && typeof entry.id === "string" && entry.id) ||
    ("name" in entry && typeof entry.name === "string" && entry.name) ||
    ("model" in entry && typeof entry.model === "string" && entry.model) ||
    null;

  if (!value) {
    return null;
  }

  return value.startsWith("models/") ? value.slice("models/".length) : value;
}

function extractModelNames(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload.map(parseModelEntryName).filter((value): value is string => Boolean(value));
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  if ("data" in payload && Array.isArray(payload.data)) {
    return payload.data.map(parseModelEntryName).filter((value): value is string => Boolean(value));
  }

  if ("models" in payload && Array.isArray(payload.models)) {
    return payload.models
      .map(parseModelEntryName)
      .filter((value): value is string => Boolean(value));
  }

  return [];
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      throw new Error(
        `Model discovery request failed with HTTP ${response.status}${responseBody ? `: ${responseBody.slice(0, 200)}` : ""}`
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchLiteLlmCatalog(timeoutMs: number): Promise<UpstreamModelCatalogEntry[]> {
  const payload = await fetchJsonWithTimeout(
    LITELLM_MODEL_CATALOG_URL,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
    timeoutMs
  );

  const modelNames =
    payload && typeof payload === "object" ? Object.keys(payload as Record<string, unknown>) : [];
  if (modelNames.length === 0) {
    throw new Error("LiteLLM catalog did not contain any model entries");
  }

  return normalizeCatalogEntries(modelNames, "inferred");
}

export async function refreshUpstreamModelCatalog(
  input: RefreshUpstreamModelCatalogInput
): Promise<RefreshUpstreamModelCatalogResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS;
  const normalizedCapabilities = resolveRouteCapabilities(input.routeCapabilities);
  const inferredConfig = inferDefaultModelDiscoveryConfig(normalizedCapabilities);
  const modelDiscovery = input.modelDiscovery
    ? normalizeUpstreamModelDiscoveryConfig(
        input.modelDiscovery,
        inferredConfig?.mode ?? "openai_compatible"
      )
    : inferredConfig;

  if (!modelDiscovery) {
    throw new Error("Unable to determine model discovery configuration");
  }

  const attemptedAt = new Date();

  try {
    if (modelDiscovery.mode === "litellm") {
      const fallbackCatalog = await fetchLiteLlmCatalog(timeoutMs);
      return {
        modelDiscovery,
        modelCatalog: fallbackCatalog,
        modelCatalogUpdatedAt: attemptedAt,
        modelCatalogLastStatus: "success",
        modelCatalogLastError: null,
        modelCatalogLastFailedAt: null,
      };
    }

    const request = buildUpstreamModelDiscoveryRequest(input);
    const payload = await fetchJsonWithTimeout(
      request.url,
      {
        method: "GET",
        headers: request.headers,
        redirect: "error",
      },
      timeoutMs
    );

    const modelNames = extractModelNames(payload);
    if (modelNames.length === 0) {
      throw new Error("Model discovery response did not contain any model entries");
    }

    return {
      modelDiscovery,
      modelCatalog: normalizeCatalogEntries(modelNames, "native"),
      modelCatalogUpdatedAt: attemptedAt,
      modelCatalogLastStatus: "success",
      modelCatalogLastError: null,
      modelCatalogLastFailedAt: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown model discovery error";

    log.warn(
      {
        err: error,
        baseUrl: input.baseUrl,
        routeCapabilities: normalizedCapabilities,
        discoveryMode: modelDiscovery.mode,
      },
      "model discovery failed"
    );

    if (modelDiscovery.enableLiteLlmFallback) {
      try {
        const fallbackCatalog = await fetchLiteLlmCatalog(timeoutMs);
        return {
          modelDiscovery,
          modelCatalog: fallbackCatalog,
          modelCatalogUpdatedAt: attemptedAt,
          modelCatalogLastStatus: "success",
          modelCatalogLastError: null,
          modelCatalogLastFailedAt: null,
        };
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : "Unknown LiteLLM fallback error";
        return {
          modelDiscovery,
          modelCatalog: input.previousCatalog ?? null,
          modelCatalogUpdatedAt: null,
          modelCatalogLastStatus: "failed",
          modelCatalogLastError: `${errorMessage}; LiteLLM fallback failed: ${fallbackMessage}`,
          modelCatalogLastFailedAt: attemptedAt,
        };
      }
    }

    return {
      modelDiscovery,
      modelCatalog: input.previousCatalog ?? null,
      modelCatalogUpdatedAt: null,
      modelCatalogLastStatus: "failed",
      modelCatalogLastError: errorMessage,
      modelCatalogLastFailedAt: attemptedAt,
    };
  }
}
