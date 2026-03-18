import type { RouteCapability } from "@/lib/route-capabilities";
import type {
  RequestThinkingConfig,
  RequestThinkingMode,
  RequestThinkingProtocol,
  RequestThinkingProvider,
} from "@/types/api";

const OPENAI_RESPONSE_CAPABILITIES = new Set<RouteCapability>([
  "openai_responses",
  "codex_cli_responses",
]);
const ANTHROPIC_CAPABILITIES = new Set<RouteCapability>([
  "anthropic_messages",
  "claude_code_messages",
]);
const GEMINI_CAPABILITIES = new Set<RouteCapability>([
  "gemini_native_generate",
  "gemini_code_assist_internal",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOwn(target: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function readOwnString(target: Record<string, unknown>, key: string): string | null {
  if (!hasOwn(target, key) || typeof target[key] !== "string") {
    return null;
  }

  const trimmed = target[key].trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOwnNumber(target: Record<string, unknown>, key: string): number | null {
  if (!hasOwn(target, key) || typeof target[key] !== "number" || !Number.isFinite(target[key])) {
    return null;
  }

  return target[key];
}

function readOwnBoolean(target: Record<string, unknown>, key: string): boolean | null {
  if (!hasOwn(target, key) || typeof target[key] !== "boolean") {
    return null;
  }

  return target[key];
}

function readOwnRecord(
  target: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  if (!hasOwn(target, key) || typeof target[key] !== "object" || target[key] === null) {
    return null;
  }

  const value = target[key];
  return Array.isArray(value) ? null : (value as Record<string, unknown>);
}

function buildThinkingConfig(input: {
  provider: RequestThinkingProvider;
  protocol: RequestThinkingProtocol;
  mode: RequestThinkingMode;
  level?: string | null;
  budgetTokens?: number | null;
  includeThoughts?: boolean | null;
  sourcePaths: string[];
}): RequestThinkingConfig | null {
  if (input.sourcePaths.length === 0) {
    return null;
  }

  return {
    provider: input.provider,
    protocol: input.protocol,
    mode: input.mode,
    level: input.level ?? null,
    budget_tokens: input.budgetTokens ?? null,
    include_thoughts: input.includeThoughts ?? null,
    source_paths: input.sourcePaths,
  };
}

function extractOpenAiThinkingConfig(
  capability: RouteCapability,
  bodyJson: Record<string, unknown>
): RequestThinkingConfig | null {
  if (OPENAI_RESPONSE_CAPABILITIES.has(capability)) {
    const reasoning = isRecord(bodyJson.reasoning) ? bodyJson.reasoning : null;
    const effort = reasoning ? readOwnString(reasoning, "effort") : null;
    return buildThinkingConfig({
      provider: "openai",
      protocol: "openai_responses",
      mode: "reasoning",
      level: effort,
      sourcePaths: effort ? ["reasoning.effort"] : [],
    });
  }

  if (capability !== "openai_chat_compatible") {
    return null;
  }

  const effort = readOwnString(bodyJson, "reasoning_effort");
  return buildThinkingConfig({
    provider: "openai",
    protocol: "openai_chat",
    mode: "reasoning",
    level: effort,
    sourcePaths: effort ? ["reasoning_effort"] : [],
  });
}

function extractAnthropicThinkingConfig(
  bodyJson: Record<string, unknown>
): RequestThinkingConfig | null {
  const sourcePaths: string[] = [];
  const thinking = readOwnRecord(bodyJson, "thinking");
  const thinkingType = thinking ? readOwnString(thinking, "type") : null;
  if (thinkingType) {
    sourcePaths.push("thinking.type");
  }

  const budgetTokens = thinking ? readOwnNumber(thinking, "budget_tokens") : null;
  if (budgetTokens != null) {
    sourcePaths.push("thinking.budget_tokens");
  }

  const outputConfig = readOwnRecord(bodyJson, "output_config");
  const outputConfigEffort = outputConfig ? readOwnString(outputConfig, "effort") : null;
  if (outputConfigEffort) {
    sourcePaths.push("output_config.effort");
  }

  const legacyEffort = readOwnString(bodyJson, "effort");
  if (legacyEffort) {
    sourcePaths.push("effort");
  }

  const effort = outputConfigEffort ?? legacyEffort;
  const isManualThinking = thinkingType === "enabled";
  const isAdaptiveThinking = thinkingType === "adaptive";

  return buildThinkingConfig({
    provider: "anthropic",
    protocol: "anthropic_messages",
    mode: isManualThinking ? "manual" : isAdaptiveThinking || effort ? "adaptive" : "thinking",
    level: effort,
    budgetTokens,
    sourcePaths,
  });
}

function extractGeminiThinkingConfig(
  bodyJson: Record<string, unknown>
): RequestThinkingConfig | null {
  const generationConfig = isRecord(bodyJson.generationConfig) ? bodyJson.generationConfig : null;
  const thinkingConfig =
    generationConfig && isRecord(generationConfig.thinkingConfig)
      ? generationConfig.thinkingConfig
      : null;

  if (!thinkingConfig) {
    return null;
  }

  const sourcePaths: string[] = [];
  const thinkingLevel = readOwnString(thinkingConfig, "thinkingLevel");
  if (thinkingLevel) {
    sourcePaths.push("generationConfig.thinkingConfig.thinkingLevel");
  }

  const thinkingBudget = readOwnNumber(thinkingConfig, "thinkingBudget");
  if (thinkingBudget != null) {
    sourcePaths.push("generationConfig.thinkingConfig.thinkingBudget");
  }

  const includeThoughts = readOwnBoolean(thinkingConfig, "includeThoughts");
  if (includeThoughts != null) {
    sourcePaths.push("generationConfig.thinkingConfig.includeThoughts");
  }

  return buildThinkingConfig({
    provider: "google",
    protocol: "gemini_generate",
    mode: "thinking",
    level: thinkingLevel,
    budgetTokens: thinkingBudget,
    includeThoughts,
    sourcePaths,
  });
}

export function extractRequestThinkingConfig(
  routeCapability: RouteCapability | null,
  bodyJson: Record<string, unknown> | null
): RequestThinkingConfig | null {
  if (!routeCapability || !bodyJson) {
    return null;
  }

  if (
    OPENAI_RESPONSE_CAPABILITIES.has(routeCapability) ||
    routeCapability === "openai_chat_compatible"
  ) {
    return extractOpenAiThinkingConfig(routeCapability, bodyJson);
  }

  if (ANTHROPIC_CAPABILITIES.has(routeCapability)) {
    return extractAnthropicThinkingConfig(bodyJson);
  }

  if (GEMINI_CAPABILITIES.has(routeCapability)) {
    return extractGeminiThinkingConfig(bodyJson);
  }

  return null;
}

export function isRequestThinkingConfig(value: unknown): value is RequestThinkingConfig {
  if (!isRecord(value)) {
    return false;
  }

  const { provider, protocol, mode, level, budget_tokens, include_thoughts, source_paths } = value;

  const isProvider = provider === "openai" || provider === "anthropic" || provider === "google";
  const isProtocol =
    protocol === "openai_responses" ||
    protocol === "openai_chat" ||
    protocol === "anthropic_messages" ||
    protocol === "gemini_generate";
  const isMode =
    mode === "reasoning" || mode === "thinking" || mode === "adaptive" || mode === "manual";

  return (
    isProvider &&
    isProtocol &&
    isMode &&
    (level === null || typeof level === "string") &&
    (budget_tokens === null || typeof budget_tokens === "number") &&
    (include_thoughts === null || typeof include_thoughts === "boolean") &&
    Array.isArray(source_paths) &&
    source_paths.every((item) => typeof item === "string")
  );
}

export function getRequestThinkingBadgeLabel(
  config: RequestThinkingConfig | null | undefined
): string | null {
  if (!config) {
    return null;
  }

  if (config.level) {
    return config.level;
  }

  if (config.mode === "adaptive" || config.mode === "manual") {
    return config.mode;
  }

  if (config.budget_tokens != null) {
    return `budget:${config.budget_tokens.toLocaleString()}`;
  }

  if (config.include_thoughts === true) {
    return "thoughts:on";
  }

  if (config.include_thoughts === false) {
    return "thoughts:off";
  }

  return null;
}
