import type { APIKeyAccessMode, Upstream } from "@/types/api";

export function normalizeApiKeyAllowedModels(models: string[] | null | undefined): string[] | null {
  const normalized = new Map<string, string>();

  for (const model of models ?? []) {
    const value = model.trim();
    if (value.length > 0 && !normalized.has(value)) {
      normalized.set(value, value);
    }
  }

  return normalized.size > 0 ? [...normalized.values()] : null;
}

export function isModelAllowedByApiKey(
  requestedModel: string | null | undefined,
  allowedModels: string[] | null | undefined
): boolean {
  const normalizedAllowedModels = normalizeApiKeyAllowedModels(allowedModels);
  if (!normalizedAllowedModels || !requestedModel) {
    return true;
  }

  return normalizedAllowedModels.includes(requestedModel);
}

export function createApiKeyModelListResponseBody(models: string[]): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      object: "list",
      data: models.map(createOpenAIModelListItem),
    })
  );
}

function createOpenAIModelListItem(model: string): Record<string, unknown> {
  return {
    id: model,
    object: "model",
    created: 0,
    owned_by: "autorouter",
  };
}

function normalizeModelNames(models: string[]): string[] {
  return models.map((model) => model.trim()).filter((model) => model.length > 0);
}

/**
 * Pick the model names an upstream is known to serve from local data only, with a
 * fixed precedence: synced model catalog first, then declared allowed models, then
 * exact model rules. Shared by every local model-list source so the precedence rule
 * lives in one place.
 */
export function pickUpstreamLocalModels(input: {
  catalogModels: string[];
  allowedModels: string[];
  exactRuleModels: string[];
}): string[] {
  const catalogModels = normalizeModelNames(input.catalogModels);
  if (catalogModels.length > 0) {
    return catalogModels;
  }

  const allowedModels = normalizeModelNames(input.allowedModels);
  if (allowedModels.length > 0) {
    return allowedModels;
  }

  return normalizeModelNames(input.exactRuleModels);
}

function getCandidateModelsFromUpstream(upstream: Upstream): string[] {
  return pickUpstreamLocalModels({
    catalogModels: (upstream.model_catalog ?? []).map((entry) => entry.model),
    allowedModels: upstream.allowed_models ?? [],
    exactRuleModels: (upstream.model_rules ?? [])
      .filter((rule) => rule.type === "exact")
      .map((rule) => rule.value),
  });
}

export function collectApiKeyModelCandidates(input: {
  upstreams: Upstream[];
  accessMode: APIKeyAccessMode;
  upstreamIds: string[];
}): string[] {
  const selectedUpstreamIdSet = new Set(input.upstreamIds);
  const candidates = new Set<string>();

  for (const upstream of input.upstreams) {
    if (upstream.is_active === false) {
      continue;
    }

    if (input.accessMode === "restricted" && !selectedUpstreamIdSet.has(upstream.id)) {
      continue;
    }

    for (const model of getCandidateModelsFromUpstream(upstream)) {
      candidates.add(model);
    }
  }

  return [...candidates].sort((a, b) => a.localeCompare(b));
}
