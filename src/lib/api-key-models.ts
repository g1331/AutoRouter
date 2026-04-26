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

export function filterApiKeyModelListResponseBody(
  bodyBytes: Uint8Array,
  allowedModels: string[] | null | undefined
): { bodyBytes: Uint8Array; filtered: boolean } {
  const normalizedAllowedModels = normalizeApiKeyAllowedModels(allowedModels);
  if (!normalizedAllowedModels) {
    return { bodyBytes, filtered: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    parsed = { object: "list" };
  }

  const payload =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { object?: unknown; data?: unknown })
      : { object: "list" };
  const upstreamModelsById = new Map<string, Record<string, unknown>>();
  if (Array.isArray(payload.data)) {
    for (const item of payload.data) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }

      const id = (item as { id?: unknown }).id;
      if (typeof id === "string") {
        upstreamModelsById.set(id, item as Record<string, unknown>);
      }
    }
  }

  const filteredData = normalizedAllowedModels.map(
    (model) => upstreamModelsById.get(model) ?? createOpenAIModelListItem(model)
  );

  return {
    bodyBytes: new TextEncoder().encode(
      JSON.stringify({
        ...payload,
        object: typeof payload.object === "string" ? payload.object : "list",
        data: filteredData,
      })
    ),
    filtered: true,
  };
}

function createOpenAIModelListItem(model: string): Record<string, unknown> {
  return {
    id: model,
    object: "model",
    created: 0,
    owned_by: "autorouter",
  };
}

function getCandidateModelsFromUpstream(upstream: Upstream): string[] {
  if (upstream.model_catalog && upstream.model_catalog.length > 0) {
    return upstream.model_catalog.map((entry) => entry.model);
  }

  if (upstream.allowed_models && upstream.allowed_models.length > 0) {
    return upstream.allowed_models;
  }

  return (upstream.model_rules ?? [])
    .filter((rule) => rule.type === "exact")
    .map((rule) => rule.value);
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
      const normalized = model.trim();
      if (normalized.length > 0) {
        candidates.add(normalized);
      }
    }
  }

  return [...candidates].sort((a, b) => a.localeCompare(b));
}
