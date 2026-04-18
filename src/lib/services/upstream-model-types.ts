import type { CapabilityProvider, RouteCapability } from "@/lib/route-capabilities";
import {
  getPrimaryProviderByCapabilities,
  resolveRouteCapabilities,
} from "@/lib/route-capabilities";

export const UPSTREAM_MODEL_DISCOVERY_MODES = [
  "openai_compatible",
  "anthropic_native",
  "gemini_native",
  "gemini_openai_compatible",
  "custom",
  "litellm",
] as const;

export type UpstreamModelDiscoveryMode = (typeof UPSTREAM_MODEL_DISCOVERY_MODES)[number];

export const UPSTREAM_MODEL_CATALOG_SOURCES = ["native", "inferred"] as const;
export type UpstreamModelCatalogSource = (typeof UPSTREAM_MODEL_CATALOG_SOURCES)[number];

export const UPSTREAM_MODEL_RULE_TYPES = ["exact", "regex", "alias"] as const;
export type UpstreamModelRuleType = (typeof UPSTREAM_MODEL_RULE_TYPES)[number];

export const UPSTREAM_MODEL_RULE_SOURCES = ["manual", "native", "inferred"] as const;
export type UpstreamModelRuleSource = (typeof UPSTREAM_MODEL_RULE_SOURCES)[number];

export const UPSTREAM_MODEL_CATALOG_STATUSES = ["success", "failed"] as const;
export type UpstreamModelCatalogStatus = (typeof UPSTREAM_MODEL_CATALOG_STATUSES)[number];

export interface UpstreamModelDiscoveryConfig {
  mode: UpstreamModelDiscoveryMode;
  customEndpoint: string | null;
  enableLiteLlmFallback: boolean;
}

export interface UpstreamModelCatalogEntry {
  model: string;
  source: UpstreamModelCatalogSource;
}

export interface UpstreamModelRule {
  type: UpstreamModelRuleType;
  value: string;
  targetModel: string | null;
  source: UpstreamModelRuleSource;
  displayLabel: string | null;
}

export interface UpstreamModelRuleSetInput {
  modelRules?: UpstreamModelRule[] | null;
  allowedModels?: string[] | null;
  modelRedirects?: Record<string, string> | null;
}

export const MODEL_RULE_DISPLAY_LABELS: Record<UpstreamModelRuleType, string> = {
  exact: "精确匹配",
  regex: "模式匹配",
  alias: "模型别名",
};

const INFERRED_DISCOVERY_MODE_BY_PROVIDER: Record<
  CapabilityProvider,
  Exclude<UpstreamModelDiscoveryMode, "custom" | "litellm">
> = {
  anthropic: "anthropic_native",
  openai: "openai_compatible",
  google: "gemini_native",
};

export function normalizeModelRuleDisplayLabel(
  type: UpstreamModelRuleType,
  displayLabel: string | null | undefined
): string {
  const normalized = displayLabel?.trim();
  return normalized && normalized.length > 0 ? normalized : MODEL_RULE_DISPLAY_LABELS[type];
}

export function normalizeModelRuleSource(
  source: string | null | undefined
): UpstreamModelRuleSource {
  if (source === "native" || source === "inferred") {
    return source;
  }
  return "manual";
}

export function normalizeModelCatalogSource(
  source: string | null | undefined
): UpstreamModelCatalogSource {
  return source === "inferred" ? "inferred" : "native";
}

export function normalizeUpstreamModelDiscoveryConfig(
  config: Partial<UpstreamModelDiscoveryConfig> | null | undefined,
  fallbackMode: UpstreamModelDiscoveryMode = "openai_compatible"
): UpstreamModelDiscoveryConfig {
  return {
    mode:
      config?.mode && UPSTREAM_MODEL_DISCOVERY_MODES.includes(config.mode)
        ? config.mode
        : fallbackMode,
    customEndpoint: config?.customEndpoint?.trim() || null,
    enableLiteLlmFallback: Boolean(config?.enableLiteLlmFallback),
  };
}

export function inferDiscoveryModeFromRouteCapabilities(
  routeCapabilities: readonly RouteCapability[] | readonly string[] | null | undefined
): UpstreamModelDiscoveryMode | null {
  const normalizedCapabilities = resolveRouteCapabilities(routeCapabilities);
  if (normalizedCapabilities.length === 0) {
    return null;
  }

  const provider = getPrimaryProviderByCapabilities(normalizedCapabilities);
  return provider ? INFERRED_DISCOVERY_MODE_BY_PROVIDER[provider] : null;
}

export function inferDefaultModelDiscoveryConfig(
  routeCapabilities: readonly RouteCapability[] | readonly string[] | null | undefined
): UpstreamModelDiscoveryConfig | null {
  const mode = inferDiscoveryModeFromRouteCapabilities(routeCapabilities);
  if (!mode) {
    return null;
  }

  return {
    mode,
    customEndpoint: null,
    enableLiteLlmFallback: false,
  };
}
