import {
  MODEL_RULE_DISPLAY_LABELS,
  normalizeModelRuleDisplayLabel,
  normalizeModelRuleSource,
  type UpstreamModelCatalogEntry,
  type UpstreamModelRule,
  type UpstreamModelRuleSetInput,
} from "./upstream-model-types";

export interface UpstreamModelRuleMatchResult {
  hasExplicitRules: boolean;
  matched: boolean;
  resolvedModel: string;
  redirectApplied: boolean;
  matchedRule: UpstreamModelRule | null;
}

export interface ImportCatalogRulesInput {
  catalog: UpstreamModelCatalogEntry[] | null | undefined;
  selectedModels: string[];
  existingRules?: UpstreamModelRule[] | null;
}

function trimOrNull(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizeExactRule(
  value: string,
  source: string | null | undefined
): UpstreamModelRule | null {
  const normalizedValue = trimOrNull(value);
  if (!normalizedValue) {
    return null;
  }

  return {
    type: "exact",
    value: normalizedValue,
    targetModel: null,
    source: normalizeModelRuleSource(source),
    displayLabel: MODEL_RULE_DISPLAY_LABELS.exact,
  };
}

function normalizeAliasRule(
  sourceModel: string,
  targetModel: string,
  source: string | null | undefined
): UpstreamModelRule | null {
  const normalizedValue = trimOrNull(sourceModel);
  const normalizedTarget = trimOrNull(targetModel);
  if (!normalizedValue || !normalizedTarget) {
    return null;
  }

  return {
    type: "alias",
    value: normalizedValue,
    targetModel: normalizedTarget,
    source: normalizeModelRuleSource(source),
    displayLabel: MODEL_RULE_DISPLAY_LABELS.alias,
  };
}

function normalizeRegexRule(
  value: string,
  source: string | null | undefined,
  displayLabel: string | null | undefined
): UpstreamModelRule | null {
  const normalizedValue = trimOrNull(value);
  if (!normalizedValue) {
    return null;
  }

  return {
    type: "regex",
    value: normalizedValue,
    targetModel: null,
    source: normalizeModelRuleSource(source),
    displayLabel: normalizeModelRuleDisplayLabel("regex", displayLabel),
  };
}

function getRuleIdentity(rule: UpstreamModelRule): string {
  return `${rule.type}:${rule.value}:${rule.targetModel ?? ""}:${rule.source}`;
}

function normalizeRule(rule: UpstreamModelRule): UpstreamModelRule | null {
  if (rule.type === "alias") {
    return normalizeAliasRule(rule.value, rule.targetModel ?? "", rule.source);
  }

  if (rule.type === "regex") {
    return normalizeRegexRule(rule.value, rule.source, rule.displayLabel);
  }

  return normalizeExactRule(rule.value, rule.source);
}

function buildAliasMap(rules: UpstreamModelRule[]): Record<string, string> {
  const aliasMap: Record<string, string> = {};
  for (const rule of rules) {
    if (rule.type !== "alias" || !rule.targetModel) {
      continue;
    }
    aliasMap[rule.value] = rule.targetModel;
  }
  return aliasMap;
}

function detectCircularRedirect(
  aliasMap: Record<string, string>,
  startModel: string,
  visited: Set<string> = new Set()
): boolean {
  if (visited.has(startModel)) {
    return true;
  }

  const targetModel = aliasMap[startModel];
  if (!targetModel) {
    return false;
  }

  visited.add(startModel);
  return detectCircularRedirect(aliasMap, targetModel, visited);
}

export function normalizeUpstreamModelRules(
  input: UpstreamModelRuleSetInput
): UpstreamModelRule[] | null {
  const normalizedRules: UpstreamModelRule[] = [];

  if (Array.isArray(input.modelRules) && input.modelRules.length > 0) {
    for (const rule of input.modelRules) {
      const normalized = normalizeRule(rule);
      if (normalized) {
        normalizedRules.push({
          ...normalized,
          displayLabel: normalizeModelRuleDisplayLabel(normalized.type, normalized.displayLabel),
        });
      }
    }
  } else {
    for (const model of input.allowedModels ?? []) {
      const normalized = normalizeExactRule(model, "manual");
      if (normalized) {
        normalizedRules.push(normalized);
      }
    }

    for (const [sourceModel, targetModel] of Object.entries(input.modelRedirects ?? {})) {
      const normalized = normalizeAliasRule(sourceModel, targetModel, "manual");
      if (normalized) {
        normalizedRules.push(normalized);
      }
    }
  }

  if (normalizedRules.length === 0) {
    return null;
  }

  const deduped = new Map<string, UpstreamModelRule>();
  for (const rule of normalizedRules) {
    deduped.set(getRuleIdentity(rule), rule);
  }

  return [...deduped.values()];
}

export function deriveAllowedModelsFromRules(
  modelRules: UpstreamModelRule[] | null | undefined
): string[] | null {
  const exactRules = (modelRules ?? [])
    .filter((rule) => rule.type === "exact")
    .map((rule) => rule.value);

  return exactRules.length > 0 ? exactRules : null;
}

export function deriveModelRedirectsFromRules(
  modelRules: UpstreamModelRule[] | null | undefined
): Record<string, string> | null {
  const redirects = Object.fromEntries(
    (modelRules ?? [])
      .filter((rule) => rule.type === "alias" && Boolean(rule.targetModel))
      .map((rule) => [rule.value, rule.targetModel!])
  );

  return Object.keys(redirects).length > 0 ? redirects : null;
}

export function hasExplicitModelRules(modelRules: UpstreamModelRule[] | null | undefined): boolean {
  return Boolean(modelRules && modelRules.length > 0);
}

export function validateUpstreamModelRules(
  modelRules: UpstreamModelRule[] | null | undefined
): string[] {
  const errors: string[] = [];
  if (!modelRules || modelRules.length === 0) {
    return errors;
  }

  const aliasMap = buildAliasMap(modelRules);
  for (const rule of modelRules) {
    if (!trimOrNull(rule.value)) {
      errors.push("Model rule value is required");
      continue;
    }

    if (rule.type === "regex") {
      try {
        new RegExp(rule.value);
      } catch {
        errors.push(`Invalid regex rule: ${rule.value}`);
      }
      continue;
    }

    if (rule.type === "alias") {
      if (!trimOrNull(rule.targetModel)) {
        errors.push(`Alias rule target is required for model: ${rule.value}`);
        continue;
      }

      if (detectCircularRedirect(aliasMap, rule.value)) {
        errors.push(`Circular alias rule detected starting from: ${rule.value}`);
      }
    }
  }

  return [...new Set(errors)];
}

export function resolveModelWithRedirects(
  model: string,
  modelRules: UpstreamModelRule[] | null | undefined
): { resolvedModel: string; redirectApplied: boolean } {
  const result = matchUpstreamModelRules(model, modelRules);
  return {
    resolvedModel: result.resolvedModel,
    redirectApplied: result.redirectApplied,
  };
}

export function matchUpstreamModelRules(
  model: string,
  modelRules: UpstreamModelRule[] | null | undefined
): UpstreamModelRuleMatchResult {
  const normalizedRules = normalizeUpstreamModelRules({
    modelRules,
  });

  if (!normalizedRules || normalizedRules.length === 0) {
    return {
      hasExplicitRules: false,
      matched: true,
      resolvedModel: model,
      redirectApplied: false,
      matchedRule: null,
    };
  }

  for (const rule of normalizedRules) {
    if (rule.type === "exact" && rule.value === model) {
      return {
        hasExplicitRules: true,
        matched: true,
        resolvedModel: model,
        redirectApplied: false,
        matchedRule: rule,
      };
    }

    if (rule.type === "alias" && rule.value === model && rule.targetModel) {
      return {
        hasExplicitRules: true,
        matched: true,
        resolvedModel: rule.targetModel,
        redirectApplied: true,
        matchedRule: rule,
      };
    }

    if (rule.type === "regex") {
      try {
        if (new RegExp(rule.value).test(model)) {
          return {
            hasExplicitRules: true,
            matched: true,
            resolvedModel: model,
            redirectApplied: false,
            matchedRule: rule,
          };
        }
      } catch {
        continue;
      }
    }
  }

  return {
    hasExplicitRules: true,
    matched: false,
    resolvedModel: model,
    redirectApplied: false,
    matchedRule: null,
  };
}

export function importCatalogEntriesToModelRules(
  input: ImportCatalogRulesInput
): UpstreamModelRule[] {
  const normalizedExistingRules =
    normalizeUpstreamModelRules({
      modelRules: input.existingRules ?? null,
    }) ?? [];
  const catalogMap = new Map((input.catalog ?? []).map((entry) => [entry.model, entry]));

  const importedRules: UpstreamModelRule[] = [];
  for (const model of input.selectedModels) {
    const catalogEntry = catalogMap.get(model);
    if (!catalogEntry) {
      throw new Error(`Model is not present in the cached catalog: ${model}`);
    }

    importedRules.push({
      type: "exact",
      value: catalogEntry.model,
      targetModel: null,
      source: catalogEntry.source,
      displayLabel: MODEL_RULE_DISPLAY_LABELS.exact,
    });
  }

  const mergedRules = [...normalizedExistingRules, ...importedRules];
  return normalizeUpstreamModelRules({ modelRules: mergedRules }) ?? [];
}
