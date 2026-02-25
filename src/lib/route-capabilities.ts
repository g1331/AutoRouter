import type { ProviderType } from "@/types/api";

export const ROUTE_CAPABILITY_VALUES = [
  "anthropic_messages",
  "codex_responses",
  "openai_chat_compatible",
  "openai_extended",
  "gemini_native_generate",
  "gemini_code_assist_internal",
] as const;

export type RouteCapability = (typeof ROUTE_CAPABILITY_VALUES)[number];

export type RouteMatchSource = "path" | "model_fallback";

export interface RouteCapabilityDefinition {
  value: RouteCapability;
  labelKey: string;
  descriptionKey: string;
  iconKey:
    | "messages_square"
    | "terminal"
    | "message_circle"
    | "blocks"
    | "sparkles"
    | "wrench"
    | "circle_help";
}

export const ROUTE_CAPABILITY_DEFINITIONS: readonly RouteCapabilityDefinition[] = [
  {
    value: "anthropic_messages",
    labelKey: "capabilityAnthropicMessages",
    descriptionKey: "capabilityAnthropicMessagesDesc",
    iconKey: "messages_square",
  },
  {
    value: "codex_responses",
    labelKey: "capabilityCodexResponses",
    descriptionKey: "capabilityCodexResponsesDesc",
    iconKey: "terminal",
  },
  {
    value: "openai_chat_compatible",
    labelKey: "capabilityOpenAIChatCompatible",
    descriptionKey: "capabilityOpenAIChatCompatibleDesc",
    iconKey: "message_circle",
  },
  {
    value: "openai_extended",
    labelKey: "capabilityOpenAIExtended",
    descriptionKey: "capabilityOpenAIExtendedDesc",
    iconKey: "blocks",
  },
  {
    value: "gemini_native_generate",
    labelKey: "capabilityGeminiNativeGenerate",
    descriptionKey: "capabilityGeminiNativeGenerateDesc",
    iconKey: "sparkles",
  },
  {
    value: "gemini_code_assist_internal",
    labelKey: "capabilityGeminiCodeAssistInternal",
    descriptionKey: "capabilityGeminiCodeAssistInternalDesc",
    iconKey: "wrench",
  },
] as const;

export const DEFAULT_ROUTE_CAPABILITIES_BY_PROVIDER: Record<ProviderType, RouteCapability[]> = {
  openai: ["codex_responses", "openai_chat_compatible", "openai_extended"],
  anthropic: ["anthropic_messages"],
  google: ["gemini_native_generate"],
  custom: [],
};

export const ROUTE_CAPABILITY_PROVIDER_HINT: Record<RouteCapability, ProviderType> = {
  anthropic_messages: "anthropic",
  codex_responses: "openai",
  openai_chat_compatible: "openai",
  openai_extended: "openai",
  gemini_native_generate: "google",
  gemini_code_assist_internal: "google",
};

export function isRouteCapability(value: string): value is RouteCapability {
  return (ROUTE_CAPABILITY_VALUES as readonly string[]).includes(value);
}

export function normalizeRouteCapabilities(
  capabilities: readonly string[] | null | undefined
): RouteCapability[] {
  if (!capabilities || capabilities.length === 0) {
    return [];
  }

  const unique = new Set<RouteCapability>();
  for (const capability of capabilities) {
    const normalized = capability.trim();
    if (!normalized) {
      continue;
    }
    if (isRouteCapability(normalized)) {
      unique.add(normalized);
    }
  }

  return ROUTE_CAPABILITY_VALUES.filter((value) => unique.has(value));
}

export function getDefaultRouteCapabilitiesForProvider(
  providerType: string | null | undefined
): RouteCapability[] {
  if (!providerType) {
    return [];
  }

  const normalized = providerType.trim().toLowerCase();
  if (normalized === "openai") {
    return [...DEFAULT_ROUTE_CAPABILITIES_BY_PROVIDER.openai];
  }
  if (normalized === "anthropic") {
    return [...DEFAULT_ROUTE_CAPABILITIES_BY_PROVIDER.anthropic];
  }
  if (normalized === "google") {
    return [...DEFAULT_ROUTE_CAPABILITIES_BY_PROVIDER.google];
  }
  if (normalized === "custom") {
    return [...DEFAULT_ROUTE_CAPABILITIES_BY_PROVIDER.custom];
  }

  return [];
}

export function resolveRouteCapabilities(
  routeCapabilities: readonly string[] | null | undefined,
  providerType: string | null | undefined
): RouteCapability[] {
  const normalized = normalizeRouteCapabilities(routeCapabilities);
  if (normalized.length > 0) {
    return normalized;
  }

  return getDefaultRouteCapabilitiesForProvider(providerType);
}
