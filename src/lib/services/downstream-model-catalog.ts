import type { Upstream } from "@/lib/db";
import { normalizeApiKeyAllowedModels } from "@/lib/api-key-models";
import {
  matchUpstreamModelRules,
  normalizeUpstreamModelRules,
} from "@/lib/services/upstream-model-rules";
import type { UpstreamModelRule } from "@/lib/services/upstream-model-types";

export interface ResolveDownstreamModelListInput {
  upstreams: Upstream[];
  allowedUpstreamIds: ReadonlySet<string>;
  apiKeyAllowedModels: string[] | null;
}

export interface DownstreamModelListResolution {
  models: string[];
  authorizedUpstreamCount: number;
  knownUpstreamCount: number;
  complete: boolean;
}

function normalizeModelNames(models: readonly (string | null | undefined)[]): string[] {
  const normalized = new Set<string>();

  for (const model of models) {
    if (typeof model !== "string") {
      continue;
    }

    const value = model.trim();
    if (value.length > 0) {
      normalized.add(value);
    }
  }

  return [...normalized];
}

function getModelsForUpstream(
  upstream: Upstream,
  rules: UpstreamModelRule[],
  apiKeyAllowedModels: string[] | null
): string[] {
  if (apiKeyAllowedModels !== null) {
    return apiKeyAllowedModels.filter(
      (model) => rules.length === 0 || matchUpstreamModelRules(model, rules).matched
    );
  }

  const catalogModels = normalizeModelNames(
    (upstream.modelCatalog ?? []).map((entry) => entry.model)
  );
  if (rules.length === 0) {
    return catalogModels;
  }

  const models = new Set<string>();
  for (const model of catalogModels) {
    if (matchUpstreamModelRules(model, rules).matched) {
      models.add(model);
    }
  }

  for (const rule of rules) {
    if (rule.type === "exact" || rule.type === "alias") {
      models.add(rule.value);
    }
  }

  return [...models];
}

/**
 * Resolves the public model list from authorized upstream cache and rules.
 */
export function resolveDownstreamModelList(
  input: ResolveDownstreamModelListInput
): DownstreamModelListResolution {
  const authorizedUpstreams = input.upstreams.filter(
    (upstream) => upstream.isActive !== false && input.allowedUpstreamIds.has(upstream.id)
  );
  const normalizedApiKeyAllowedModels =
    input.apiKeyAllowedModels === null
      ? null
      : normalizeApiKeyAllowedModels(input.apiKeyAllowedModels);
  const upstreamEntries = authorizedUpstreams.map((upstream) => ({
    upstream,
    rules:
      normalizeUpstreamModelRules({
        modelRules: upstream.modelRules,
        allowedModels: upstream.allowedModels,
        modelRedirects: upstream.modelRedirects,
      }) ?? [],
  }));
  const aliasTargets = new Set<string>();

  for (const { rules } of upstreamEntries) {
    for (const rule of rules) {
      if (rule.type === "alias" && rule.targetModel) {
        aliasTargets.add(rule.targetModel);
      }
    }
  }

  const models = new Set<string>();
  let knownUpstreamCount = 0;

  for (const { upstream, rules } of upstreamEntries) {
    const visibleModels = getModelsForUpstream(
      upstream,
      rules,
      normalizedApiKeyAllowedModels
    ).filter((model) => !aliasTargets.has(model));

    if (visibleModels.length > 0) {
      knownUpstreamCount += 1;
    }

    for (const model of visibleModels) {
      models.add(model);
    }
  }

  const resolvedModels =
    normalizedApiKeyAllowedModels === null
      ? [...models].sort((a, b) => a.localeCompare(b))
      : [...models];

  return {
    models: resolvedModels,
    authorizedUpstreamCount: authorizedUpstreams.length,
    knownUpstreamCount,
    complete: authorizedUpstreams.length > 0 && knownUpstreamCount === authorizedUpstreams.length,
  };
}
