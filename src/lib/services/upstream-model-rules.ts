import { z } from "zod";

export const MODEL_DISCOVERY_MODES = [
  "openai_compatible",
  "anthropic_native",
  "gemini_native",
  "gemini_openai_compatible",
  "custom",
] as const;

export type UpstreamModelDiscoveryMode = (typeof MODEL_DISCOVERY_MODES)[number];

export interface UpstreamModelDiscoveryConfig {
  mode: UpstreamModelDiscoveryMode;
  customEndpoint: string | null;
  enableLiteLlmFallback: boolean;
}

export const MODEL_RULE_TYPES = ["exact", "regex", "alias"] as const;
export type UpstreamModelRuleType = (typeof MODEL_RULE_TYPES)[number];

export const MODEL_RULE_SOURCES = ["manual", "native", "inferred"] as const;
export type UpstreamModelRuleSource = (typeof MODEL_RULE_SOURCES)[number];

export interface ExactUpstreamModelRule {
  type: "exact";
  model: string;
  source: UpstreamModelRuleSource;
}

export interface RegexUpstreamModelRule {
  type: "regex";
  pattern: string;
  source: UpstreamModelRuleSource;
}

export interface AliasUpstreamModelRule {
  type: "alias";
  alias: string;
  targetModel: string;
  source: UpstreamModelRuleSource;
}

export type UpstreamModelRule =
  | ExactUpstreamModelRule
  | RegexUpstreamModelRule
  | AliasUpstreamModelRule;

export interface LegacyUpstreamModelConfig {
  allowedModels?: string[] | null;
  modelRedirects?: Record<string, string> | null;
}

export interface ModelRuleMatchResult {
  matches: boolean;
  restrictiveRulesConfigured: boolean;
  resolvedModel: string;
  modelRedirectApplied: boolean;
  matchedRuleType: UpstreamModelRuleType | null;
  matchedRuleSource: UpstreamModelRuleSource | null;
}

export interface LegacyModelCandidate {
  id: string;
  name: string;
  allowedModels?: string[] | null;
  modelRedirects?: Record<string, string> | null;
}

export interface FilteredLegacyModelCandidates<TCandidate extends LegacyModelCandidate> {
  allowed: TCandidate[];
  excluded: Array<{
    id: string;
    name: string;
    reason: "model_not_allowed";
  }>;
  matchesByUpstreamId: Record<string, ModelRuleMatchResult>;
}

const modelDiscoveryConfigSchema = z.object({
  mode: z.enum(MODEL_DISCOVERY_MODES),
  customEndpoint: z.string().trim().min(1).nullable().optional(),
  enableLiteLlmFallback: z.boolean().optional(),
});

const exactUpstreamModelRuleSchema = z.object({
  type: z.literal("exact"),
  model: z.string().trim().min(1),
  source: z.enum(MODEL_RULE_SOURCES),
});

const regexUpstreamModelRuleSchema = z.object({
  type: z.literal("regex"),
  pattern: z.string().trim().min(1),
  source: z.enum(MODEL_RULE_SOURCES),
});

const aliasUpstreamModelRuleSchema = z.object({
  type: z.literal("alias"),
  alias: z.string().trim().min(1),
  targetModel: z.string().trim().min(1),
  source: z.enum(MODEL_RULE_SOURCES),
});

const upstreamModelRuleSchema = z.discriminatedUnion("type", [
  exactUpstreamModelRuleSchema,
  regexUpstreamModelRuleSchema,
  aliasUpstreamModelRuleSchema,
]);

function normalizeStringList(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function normalizeRedirectEntries(
  redirects: Record<string, string> | null | undefined
): Record<string, string> {
  if (!redirects) {
    return {};
  }

  const normalized: Record<string, string> = {};

  for (const [rawAlias, rawTarget] of Object.entries(redirects)) {
    const alias = rawAlias.trim();
    const targetModel = rawTarget.trim();

    if (!alias || !targetModel) {
      continue;
    }

    normalized[alias] = targetModel;
  }

  return normalized;
}

function createNoRestrictionMatch(model: string): ModelRuleMatchResult {
  return {
    matches: true,
    restrictiveRulesConfigured: false,
    resolvedModel: model,
    modelRedirectApplied: false,
    matchedRuleType: null,
    matchedRuleSource: null,
  };
}

function regexMatchesModel(model: string, pattern: string): boolean {
  try {
    return new RegExp(pattern).test(model);
  } catch {
    return false;
  }
}

export function normalizeModelDiscoveryConfig(
  input: Partial<UpstreamModelDiscoveryConfig> | null | undefined
): UpstreamModelDiscoveryConfig | null {
  if (!input) {
    return null;
  }

  return {
    mode: input.mode ?? "openai_compatible",
    customEndpoint: input.customEndpoint?.trim() || null,
    enableLiteLlmFallback: input.enableLiteLlmFallback ?? false,
  };
}

export function parseModelDiscoveryConfig(input: unknown): UpstreamModelDiscoveryConfig | null {
  if (input == null) {
    return null;
  }

  const parsed = modelDiscoveryConfigSchema.parse(input);
  return normalizeModelDiscoveryConfig(parsed);
}

export function parseUpstreamModelRules(input: unknown): UpstreamModelRule[] | null {
  if (input == null) {
    return null;
  }

  const parsed = z.array(upstreamModelRuleSchema).parse(input);
  return parsed.length > 0 ? parsed : null;
}

export function normalizeLegacyModelRules(
  config: LegacyUpstreamModelConfig,
  source: UpstreamModelRuleSource = "manual"
): UpstreamModelRule[] | null {
  // Keep exact rules ahead of aliases so legacy config can be migrated deterministically.
  const exactRules = normalizeStringList(config.allowedModels).map<ExactUpstreamModelRule>(
    (model) => ({
      type: "exact",
      model,
      source,
    })
  );

  const aliasRules = Object.entries(
    normalizeRedirectEntries(config.modelRedirects)
  ).map<AliasUpstreamModelRule>(([alias, targetModel]) => ({
    type: "alias",
    alias,
    targetModel,
    source,
  }));

  const rules = [...exactRules, ...aliasRules];
  return rules.length > 0 ? rules : null;
}

export function resolveLegacyModelRedirects(
  model: string,
  modelRedirects: Record<string, string> | null | undefined,
  maxDepth: number = 10
): { resolvedModel: string; redirectApplied: boolean } {
  const normalizedRedirects = normalizeRedirectEntries(modelRedirects);
  if (Object.keys(normalizedRedirects).length === 0) {
    return { resolvedModel: model, redirectApplied: false };
  }

  let currentModel = model;
  let redirectApplied = false;
  let depth = 0;

  while (depth < maxDepth) {
    const targetModel = normalizedRedirects[currentModel];
    if (!targetModel) {
      break;
    }

    currentModel = targetModel;
    redirectApplied = true;
    depth++;
  }

  return { resolvedModel: currentModel, redirectApplied };
}

export function matchLegacyUpstreamModelConfig(
  model: string,
  config: LegacyUpstreamModelConfig
): ModelRuleMatchResult {
  const normalizedAllowedModels = normalizeStringList(config.allowedModels);
  const restrictiveRulesConfigured = normalizedAllowedModels.length > 0;
  const { resolvedModel, redirectApplied } = resolveLegacyModelRedirects(
    model,
    config.modelRedirects
  );

  if (!restrictiveRulesConfigured) {
    // Legacy redirect-only upstreams still accept unmatched models; only allow lists tighten routing.
    return {
      matches: true,
      restrictiveRulesConfigured: false,
      resolvedModel,
      modelRedirectApplied: redirectApplied,
      matchedRuleType: redirectApplied ? "alias" : null,
      matchedRuleSource: redirectApplied ? "manual" : null,
    };
  }

  const matches = normalizedAllowedModels.includes(resolvedModel);
  return {
    matches,
    restrictiveRulesConfigured,
    resolvedModel,
    modelRedirectApplied: redirectApplied,
    matchedRuleType: matches ? (redirectApplied ? "alias" : "exact") : null,
    matchedRuleSource: matches ? "manual" : null,
  };
}

export function matchUpstreamModelRules(
  model: string,
  rules: UpstreamModelRule[] | null | undefined
): ModelRuleMatchResult {
  if (!rules || rules.length === 0) {
    return createNoRestrictionMatch(model);
  }

  // Preserve legacy redirect precedence so alias-style remaps keep winning over exact allow checks.
  for (const rule of rules) {
    if (rule.type === "alias" && rule.alias === model) {
      return {
        matches: true,
        restrictiveRulesConfigured: true,
        resolvedModel: rule.targetModel,
        modelRedirectApplied: true,
        matchedRuleType: "alias",
        matchedRuleSource: rule.source,
      };
    }
  }

  for (const rule of rules) {
    if (rule.type === "exact" && rule.model === model) {
      return {
        matches: true,
        restrictiveRulesConfigured: true,
        resolvedModel: model,
        modelRedirectApplied: false,
        matchedRuleType: "exact",
        matchedRuleSource: rule.source,
      };
    }
  }

  for (const rule of rules) {
    if (rule.type === "regex" && regexMatchesModel(model, rule.pattern)) {
      return {
        matches: true,
        restrictiveRulesConfigured: true,
        resolvedModel: model,
        modelRedirectApplied: false,
        matchedRuleType: "regex",
        matchedRuleSource: rule.source,
      };
    }
  }

  return {
    matches: false,
    restrictiveRulesConfigured: true,
    resolvedModel: model,
    modelRedirectApplied: false,
    matchedRuleType: null,
    matchedRuleSource: null,
  };
}

export function filterCandidateUpstreamsByLegacyModelSupport<
  TCandidate extends LegacyModelCandidate,
>(candidates: TCandidate[], model: string): FilteredLegacyModelCandidates<TCandidate> {
  const allowed: TCandidate[] = [];
  const excluded: FilteredLegacyModelCandidates<TCandidate>["excluded"] = [];
  const matchesByUpstreamId: Record<string, ModelRuleMatchResult> = {};

  // This mirrors the future proxy insertion point: capability filtering first, model support pruning second.
  for (const candidate of candidates) {
    const match = matchLegacyUpstreamModelConfig(model, candidate);
    matchesByUpstreamId[candidate.id] = match;

    if (!match.restrictiveRulesConfigured || match.matches) {
      allowed.push(candidate);
      continue;
    }

    excluded.push({
      id: candidate.id,
      name: candidate.name,
      reason: "model_not_allowed",
    });
  }

  return {
    allowed,
    excluded,
    matchesByUpstreamId,
  };
}
