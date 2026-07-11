import type { ComponentProps } from "react";

import type { Badge } from "@/components/ui/badge";
import {
  getPrimaryProviderByCapabilities,
  resolveRouteCapabilities,
} from "@/lib/route-capabilities";
import type {
  RouteCapability,
  Upstream,
  UpstreamCatalogPreviewResponse,
  UpstreamModelCatalogEntry,
  UpstreamModelCatalogSource,
  UpstreamModelCatalogStatus,
  UpstreamModelRuleSource,
} from "@/types/api";

import type { UpstreamFormValues } from "./section-schemas";

/**
 * Model-catalog workspace helpers for the upstream detail-page model-routing
 * section: catalog preview/refresh/import state and the derived view models the
 * section renders.
 */

export type CatalogSourceFilter = "all" | UpstreamModelCatalogSource;

export interface CatalogWorkspaceState {
  modelCatalog: UpstreamModelCatalogEntry[];
  modelCatalogUpdatedAt: string | null;
  modelCatalogLastStatus: UpstreamModelCatalogStatus | null;
  modelCatalogLastError: string | null;
  modelCatalogLastFailedAt: string | null;
}

export function buildCatalogWorkspaceState(upstream?: Upstream | null): CatalogWorkspaceState {
  const modelCatalog = upstream?.model_catalog ?? [];
  const legacyLiteLlmCatalog =
    modelCatalog.some((entry) => entry.source === "inferred") &&
    (upstream?.model_discovery?.mode === "litellm" ||
      (upstream?.model_discovery?.enable_lite_llm_fallback === true &&
        modelCatalog.every((entry) => entry.source === "inferred" || entry.source === "litellm")));

  return {
    modelCatalog: legacyLiteLlmCatalog
      ? modelCatalog.map((entry) =>
          entry.source === "inferred" ? { ...entry, source: "litellm" } : entry
        )
      : modelCatalog,
    modelCatalogUpdatedAt: upstream?.model_catalog_updated_at ?? null,
    modelCatalogLastStatus: upstream?.model_catalog_last_status ?? null,
    modelCatalogLastError: upstream?.model_catalog_last_error ?? null,
    modelCatalogLastFailedAt: upstream?.model_catalog_last_failed_at ?? null,
  };
}

export function applyCatalogPreviewToUpstream(
  upstream: Upstream,
  preview: UpstreamCatalogPreviewResponse
): Upstream {
  return {
    ...upstream,
    model_discovery: preview.model_discovery,
    model_catalog: preview.model_catalog,
    model_catalog_updated_at: preview.model_catalog_updated_at,
    model_catalog_last_status: preview.model_catalog_last_status,
    model_catalog_last_error: preview.model_catalog_last_error,
    model_catalog_last_failed_at: preview.model_catalog_last_failed_at,
  };
}

export function areCatalogWorkspaceStatesEqual(
  left: CatalogWorkspaceState,
  right: CatalogWorkspaceState
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function importCatalogModelsIntoRules(
  catalog: UpstreamModelCatalogEntry[],
  selectedModels: string[],
  currentRules: UpstreamFormValues["model_rules"]
): UpstreamFormValues["model_rules"] {
  const catalogByModel = new Map(catalog.map((entry) => [entry.model, entry]));
  const nextRules = [...currentRules];

  for (const model of selectedModels) {
    const catalogEntry = catalogByModel.get(model);
    if (!catalogEntry) {
      continue;
    }

    const importedRule: UpstreamFormValues["model_rules"][number] = {
      type: "exact",
      value: catalogEntry.model,
      target_model: null,
      source: catalogEntry.source,
      display_label: null,
    };
    const alreadyPresent = nextRules.some(
      (rule) =>
        rule.type === importedRule.type &&
        rule.value === importedRule.value &&
        (rule.target_model ?? null) === importedRule.target_model &&
        rule.source === importedRule.source
    );

    if (!alreadyPresent) {
      nextRules.push(importedRule);
    }
  }

  return nextRules;
}

export function getUniqueCatalogModels(catalog: readonly UpstreamModelCatalogEntry[]): string[] {
  return Array.from(new Set(catalog.map((entry) => entry.model))).sort((left, right) =>
    left.localeCompare(right)
  );
}

export function formatCatalogTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleString();
}

export function getRuleSourceBadgeVariant(
  source: UpstreamModelRuleSource
): NonNullable<ComponentProps<typeof Badge>["variant"]> {
  if (source === "native") {
    return "success";
  }
  if (source === "inferred") {
    return "info";
  }
  if (source === "litellm") {
    return "warning";
  }
  return "secondary";
}

// ── Model-discovery request preview ────────────────────────────────────────────

export interface ModelDiscoveryPreviewState {
  apiRoot: string;
  requestUrl: string | null;
  authProfile: "bearer" | "anthropic" | "query_key" | "public";
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

function normalizeApiRootForDiscoveryPreview(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.hash = "";
  url.search = "";
  url.pathname = stripTrailingModelsPath(stripTrailingSlash(url.pathname || "/"));
  return url.toString().replace(/\/$/, url.pathname === "/" ? "" : "");
}

export function resolveDiscoveryPreview(
  rawBaseUrl: string,
  routeCapabilities: RouteCapability[] | null | undefined,
  modelDiscovery: UpstreamFormValues["model_discovery"] | undefined
): ModelDiscoveryPreviewState | null {
  const trimmedBaseUrl = rawBaseUrl.trim();
  if (!trimmedBaseUrl) {
    return null;
  }

  try {
    const apiRoot = normalizeApiRootForDiscoveryPreview(trimmedBaseUrl);
    const provider = getPrimaryProviderByCapabilities(resolveRouteCapabilities(routeCapabilities));
    const mode = modelDiscovery?.mode ?? "openai_compatible";
    let requestUrl: URL;
    let authProfile: ModelDiscoveryPreviewState["authProfile"];

    switch (mode) {
      case "anthropic_native":
        requestUrl = new URL("models", `${apiRoot}/`);
        authProfile = "anthropic";
        break;
      case "gemini_native":
        requestUrl = new URL("models", `${apiRoot}/`);
        requestUrl.searchParams.set("key", "API_KEY");
        authProfile = "query_key";
        break;
      case "custom": {
        const customEndpoint = modelDiscovery?.custom_endpoint.trim();
        if (!customEndpoint) {
          return {
            apiRoot,
            requestUrl: null,
            authProfile:
              provider === "anthropic"
                ? "anthropic"
                : provider === "google"
                  ? "query_key"
                  : "bearer",
          };
        }
        requestUrl = new URL(customEndpoint, `${apiRoot}/`);
        authProfile =
          provider === "anthropic" ? "anthropic" : provider === "google" ? "query_key" : "bearer";
        if (authProfile === "query_key") {
          requestUrl.searchParams.set("key", "API_KEY");
        }
        break;
      }
      case "litellm":
        requestUrl = new URL(
          "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
        );
        authProfile = "public";
        break;
      case "gemini_openai_compatible":
      case "openai_compatible":
      default:
        requestUrl = new URL("models", `${apiRoot}/`);
        authProfile = "bearer";
        break;
    }

    return {
      apiRoot,
      requestUrl: requestUrl.toString(),
      authProfile,
    };
  } catch {
    return null;
  }
}
