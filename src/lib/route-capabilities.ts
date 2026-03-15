export const ROUTE_CAPABILITY_VALUES = [
  "anthropic_messages",
  "claude_code_messages",
  "openai_responses",
  "codex_cli_responses",
  "openai_chat_compatible",
  "openai_extended",
  "gemini_native_generate",
  "gemini_code_assist_internal",
] as const;

export type RouteCapability = (typeof ROUTE_CAPABILITY_VALUES)[number];

export type RouteMatchSource = "path" | "path_header_profile" | "model_fallback";
export type CapabilityProvider = "anthropic" | "openai" | "google";

const LEGACY_ROUTE_CAPABILITY = "codex_responses";

const LEGACY_UPSTREAM_CAPABILITY_MAP: Record<string, readonly RouteCapability[]> = {
  [LEGACY_ROUTE_CAPABILITY]: ["openai_responses"],
};

const LEGACY_COMPENSATION_CAPABILITY_MAP: Record<string, readonly RouteCapability[]> = {
  [LEGACY_ROUTE_CAPABILITY]: ["openai_responses", "codex_cli_responses"],
};

export interface RouteCapabilityDefinition {
  value: RouteCapability;
  labelKey: string;
  descriptionKey: string;
  iconKey:
    | "messages_square"
    | "terminal"
    | "terminal_anthropic"
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
    value: "claude_code_messages",
    labelKey: "capabilityClaudeCodeMessages",
    descriptionKey: "capabilityClaudeCodeMessagesDesc",
    iconKey: "terminal_anthropic",
  },
  {
    value: "openai_responses",
    labelKey: "capabilityOpenAIResponses",
    descriptionKey: "capabilityOpenAIResponsesDesc",
    iconKey: "message_circle",
  },
  {
    value: "codex_cli_responses",
    labelKey: "capabilityCodexCliResponses",
    descriptionKey: "capabilityCodexCliResponsesDesc",
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

export const ROUTE_CAPABILITY_PROVIDER_MAP: Record<RouteCapability, CapabilityProvider> = {
  anthropic_messages: "anthropic",
  claude_code_messages: "anthropic",
  openai_responses: "openai",
  codex_cli_responses: "openai",
  openai_chat_compatible: "openai",
  openai_extended: "openai",
  gemini_native_generate: "google",
  gemini_code_assist_internal: "google",
};

export function isRouteCapability(value: string): value is RouteCapability {
  return (ROUTE_CAPABILITY_VALUES as readonly string[]).includes(value);
}

export function isLegacyRouteCapability(value: string): boolean {
  return value.trim() === LEGACY_ROUTE_CAPABILITY;
}

export interface RouteCapabilityNormalizationResult {
  capabilities: RouteCapability[];
  remappedValues: string[];
  invalidValues: string[];
}

function normalizeCapabilitiesWithMap(
  capabilities: readonly string[] | null | undefined,
  legacyCapabilityMap: Record<string, readonly RouteCapability[]>
): RouteCapabilityNormalizationResult {
  if (!capabilities || capabilities.length === 0) {
    return {
      capabilities: [],
      remappedValues: [],
      invalidValues: [],
    };
  }

  const unique = new Set<RouteCapability>();
  const remappedValues = new Set<string>();
  const invalidValues = new Set<string>();
  for (const capability of capabilities) {
    const normalized = capability.trim();
    if (!normalized) {
      continue;
    }

    let mappedCapabilities: readonly RouteCapability[] = [];
    if (isRouteCapability(normalized)) {
      mappedCapabilities = [normalized];
    } else if (legacyCapabilityMap[normalized]) {
      mappedCapabilities = legacyCapabilityMap[normalized];
      remappedValues.add(normalized);
    } else {
      invalidValues.add(normalized);
      continue;
    }

    for (const mappedCapability of mappedCapabilities) {
      unique.add(mappedCapability);
    }
  }

  return {
    capabilities: ROUTE_CAPABILITY_VALUES.filter((value) => unique.has(value)),
    remappedValues: Array.from(remappedValues),
    invalidValues: Array.from(invalidValues),
  };
}

export function normalizeRouteCapabilitiesWithMeta(
  capabilities: readonly string[] | null | undefined,
  options?: {
    aliases?: Record<string, readonly RouteCapability[]>;
  }
): RouteCapabilityNormalizationResult {
  return normalizeCapabilitiesWithMap(capabilities, {
    ...LEGACY_UPSTREAM_CAPABILITY_MAP,
    ...(options?.aliases ?? {}),
  });
}

export function normalizeRouteCapabilities(
  capabilities: readonly string[] | null | undefined
): RouteCapability[] {
  return normalizeRouteCapabilitiesWithMeta(capabilities).capabilities;
}

export function normalizeCompensationRuleCapabilities(
  capabilities: readonly string[] | null | undefined
): RouteCapability[] {
  return normalizeRouteCapabilitiesWithMeta(capabilities, {
    aliases: LEGACY_COMPENSATION_CAPABILITY_MAP,
  }).capabilities;
}

export function resolveRouteCapabilities(
  routeCapabilities: readonly string[] | null | undefined
): RouteCapability[] {
  return normalizeRouteCapabilities(routeCapabilities);
}

export function isCliRouteCapability(capability: RouteCapability): boolean {
  return capability === "codex_cli_responses" || capability === "claude_code_messages";
}

export function getFallbackRouteCapability(capability: RouteCapability): RouteCapability | null {
  switch (capability) {
    case "codex_cli_responses":
      return "openai_responses";
    case "claude_code_messages":
      return "anthropic_messages";
    default:
      return null;
  }
}

export function getGenericRouteCapability(capability: RouteCapability): RouteCapability {
  return getFallbackRouteCapability(capability) ?? capability;
}

export function areSingleProviderCapabilities(capabilities: readonly RouteCapability[]): boolean {
  if (capabilities.length <= 1) return true;
  const first = ROUTE_CAPABILITY_PROVIDER_MAP[capabilities[0]];
  return capabilities.every((capability) => ROUTE_CAPABILITY_PROVIDER_MAP[capability] === first);
}

export function getProviderByRouteCapability(capability: RouteCapability): CapabilityProvider {
  return ROUTE_CAPABILITY_PROVIDER_MAP[capability];
}

export function getPrimaryProviderByCapabilities(
  routeCapabilities: readonly string[] | null | undefined
): CapabilityProvider | null {
  const normalized = resolveRouteCapabilities(routeCapabilities);
  if (normalized.length === 0) {
    return null;
  }
  return getProviderByRouteCapability(normalized[0]);
}
