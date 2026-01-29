import { eq } from "drizzle-orm";
import { db, upstreams, upstreamGroups, type Upstream } from "../db";

/**
 * Valid provider types for model-based routing
 */
export const VALID_PROVIDER_TYPES = ["anthropic", "openai", "google", "custom"] as const;

export type ProviderType = (typeof VALID_PROVIDER_TYPES)[number];

/**
 * Model prefix to provider type mapping
 */
export const MODEL_PREFIX_TO_PROVIDER_TYPE: Record<string, ProviderType> = {
  "claude-": "anthropic",
  "gpt-": "openai",
  "gemini-": "google",
};

/**
 * Result of model routing operation
 */
export interface ModelRouterResult {
  upstream: Upstream | null;
  groupName: string | null;
  providerType: ProviderType | null;
  resolvedModel: string;
  routingDecision: {
    originalModel: string;
    resolvedModel: string;
    providerType: ProviderType | null;
    groupName: string | null;
    upstreamName: string | null;
    allowedModelsFilter: boolean;
    modelRedirectApplied: boolean;
  };
}

/**
 * Error thrown when no upstream group is configured for a model
 */
export class NoUpstreamGroupError extends Error {
  constructor(model: string) {
    super(`No upstream group configured for model: ${model}`);
    this.name = "NoUpstreamGroupError";
  }
}

/**
 * Error thrown when circular redirect is detected
 */
export class CircularRedirectError extends Error {
  constructor(model: string) {
    super(`Circular model redirect detected: ${model}`);
    this.name = "CircularRedirectError";
  }
}

/**
 * Get provider type based on model name prefix
 */
export function getProviderTypeForModel(model: string): ProviderType | null {
  const lowerModel = model.toLowerCase();

  for (const [prefix, providerType] of Object.entries(MODEL_PREFIX_TO_PROVIDER_TYPE)) {
    if (lowerModel.startsWith(prefix)) {
      return providerType;
    }
  }

  return null;
}

/**
 * Detect circular redirects in model redirects configuration
 */
export function detectCircularRedirect(
  modelRedirects: Record<string, string>,
  startModel: string,
  visited: Set<string> = new Set()
): boolean {
  if (visited.has(startModel)) {
    return true;
  }

  const targetModel = modelRedirects[startModel];
  if (!targetModel) {
    return false;
  }

  visited.add(startModel);
  return detectCircularRedirect(modelRedirects, targetModel, visited);
}

/**
 * Validate model redirects configuration
 * Returns null if valid, error message if invalid
 */
export function validateModelRedirects(
  modelRedirects: Record<string, string> | null
): string | null {
  if (!modelRedirects || Object.keys(modelRedirects).length === 0) {
    return null;
  }

  for (const sourceModel of Object.keys(modelRedirects)) {
    if (detectCircularRedirect(modelRedirects, sourceModel)) {
      return `Circular redirect detected starting from: ${sourceModel}`;
    }
  }

  return null;
}

/**
 * Resolve model name with redirects
 */
export function resolveModelWithRedirects(
  model: string,
  modelRedirects: Record<string, string> | null,
  maxDepth: number = 10
): { resolvedModel: string; redirectApplied: boolean } {
  if (!modelRedirects || Object.keys(modelRedirects).length === 0) {
    return { resolvedModel: model, redirectApplied: false };
  }

  let currentModel = model;
  let redirectApplied = false;
  let depth = 0;

  while (depth < maxDepth) {
    const targetModel = modelRedirects[currentModel];
    if (!targetModel) {
      break;
    }
    currentModel = targetModel;
    redirectApplied = true;
    depth++;
  }

  return { resolvedModel: currentModel, redirectApplied };
}

/**
 * Filter upstreams by model support (allowedModels)
 */
export function filterUpstreamsByModel(upstreamList: Upstream[], model: string): Upstream[] {
  return upstreamList.filter((upstream) => {
    // If no allowedModels specified, upstream accepts all models
    if (!upstream.allowedModels || upstream.allowedModels.length === 0) {
      return true;
    }

    // Check if model is in allowed list
    return upstream.allowedModels.includes(model);
  });
}

/**
 * Route request to appropriate upstream based on model
 */
export async function routeByModel(model: string): Promise<ModelRouterResult> {
  const originalModel = model;

  // Step 1: Determine provider type from model prefix
  const providerType = getProviderTypeForModel(model);

  if (!providerType) {
    return {
      upstream: null,
      groupName: null,
      providerType: null,
      resolvedModel: model,
      routingDecision: {
        originalModel,
        resolvedModel: model,
        providerType: null,
        groupName: null,
        upstreamName: null,
        allowedModelsFilter: false,
        modelRedirectApplied: false,
      },
    };
  }

  // Step 2: Find upstream group by provider type
  const group = await db.query.upstreamGroups.findFirst({
    where: eq(upstreamGroups.name, providerType),
  });

  if (!group) {
    throw new NoUpstreamGroupError(model);
  }

  // Step 3: Get all active upstreams in the group
  const upstreamList = await db.query.upstreams.findMany({
    where: eq(upstreams.groupId, group.id),
  });

  if (upstreamList.length === 0) {
    throw new NoUpstreamGroupError(model);
  }

  // Step 4: Apply model redirects on each upstream and find matching upstream
  let selectedUpstream: Upstream | null = null;
  let finalResolvedModel = model;
  let redirectApplied = false;

  for (const upstream of upstreamList) {
    const { resolvedModel, redirectApplied: wasRedirected } = resolveModelWithRedirects(
      model,
      upstream.modelRedirects
    );

    // Check if this upstream supports the resolved model
    const supportsModel =
      !upstream.allowedModels ||
      upstream.allowedModels.length === 0 ||
      upstream.allowedModels.includes(resolvedModel);

    if (supportsModel) {
      selectedUpstream = upstream;
      finalResolvedModel = resolvedModel;
      redirectApplied = wasRedirected;
      break;
    }
  }

  // If no upstream supports the model, use first upstream (fallback)
  if (!selectedUpstream) {
    selectedUpstream = upstreamList[0];
    const { resolvedModel } = resolveModelWithRedirects(model, selectedUpstream.modelRedirects);
    finalResolvedModel = resolvedModel;
  }

  return {
    upstream: selectedUpstream,
    groupName: group.name,
    providerType,
    resolvedModel: finalResolvedModel,
    routingDecision: {
      originalModel,
      resolvedModel: finalResolvedModel,
      providerType,
      groupName: group.name,
      upstreamName: selectedUpstream?.name ?? null,
      allowedModelsFilter: upstreamList.some((u) => u.allowedModels && u.allowedModels.length > 0),
      modelRedirectApplied: redirectApplied,
    },
  };
}
