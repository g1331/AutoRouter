import { eq, and } from "drizzle-orm";
import { db, upstreams, type Upstream } from "../db";
import { getCircuitBreakerState, CircuitBreakerStateEnum } from "./circuit-breaker";

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
 * Excluded upstream with reason
 */
export interface ExcludedUpstream {
  id: string;
  name: string;
  reason: "circuit_open" | "model_not_allowed" | "unhealthy";
}

/**
 * Candidate upstream with circuit breaker state
 */
export interface CandidateUpstream {
  id: string;
  name: string;
  weight: number;
  circuitState: string;
  allowedModels: string[] | null;
}

/**
 * Result of model routing operation
 */
export interface ModelRouterResult {
  upstream: Upstream | null;
  providerType: ProviderType | null;
  resolvedModel: string;
  candidateUpstreams: CandidateUpstream[];
  excludedUpstreams: ExcludedUpstream[];
  routingDecision: {
    originalModel: string;
    resolvedModel: string;
    providerType: ProviderType | null;
    upstreamName: string | null;
    allowedModelsFilter: boolean;
    modelRedirectApplied: boolean;
    circuitBreakerFilter: boolean;
    routingType: "provider_type" | "none";
    candidateCount: number;
    finalCandidateCount: number;
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
 * Error thrown when no healthy upstreams available for a model
 */
export class NoHealthyUpstreamError extends Error {
  constructor(
    public readonly model: string,
    public readonly providerType: ProviderType | null
  ) {
    super(`No healthy upstreams available for model: ${model}`);
    this.name = "NoHealthyUpstreamError";
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
 * Filter upstreams by circuit breaker state (exclude OPEN state)
 * Returns the filtered list and list of excluded upstreams
 */
export async function filterUpstreamsByCircuitBreaker(upstreamList: Upstream[]): Promise<{
  allowed: Upstream[];
  excluded: ExcludedUpstream[];
}> {
  const allowed: Upstream[] = [];
  const excluded: ExcludedUpstream[] = [];

  for (const upstream of upstreamList) {
    const cbState = await getCircuitBreakerState(upstream.id);

    if (cbState && cbState.state === CircuitBreakerStateEnum.OPEN) {
      excluded.push({
        id: upstream.id,
        name: upstream.name,
        reason: "circuit_open",
      });
    } else {
      allowed.push(upstream);
    }
  }

  return { allowed, excluded };
}

/**
 * Get upstreams by provider type
 */
export async function getUpstreamsByProviderType(providerType: ProviderType): Promise<{
  upstreams: Upstream[];
  routingType: "provider_type";
}> {
  const providerTypeUpstreams = await db.query.upstreams.findMany({
    where: and(eq(upstreams.providerType, providerType), eq(upstreams.isActive, true)),
  });

  return {
    upstreams: providerTypeUpstreams,
    routingType: "provider_type",
  };
}

/**
 * Build candidate upstream list with circuit breaker state
 */
async function buildCandidateList(upstreamList: Upstream[]): Promise<CandidateUpstream[]> {
  return Promise.all(
    upstreamList.map(async (upstream) => {
      const cbState = await getCircuitBreakerState(upstream.id);
      return {
        id: upstream.id,
        name: upstream.name,
        weight: upstream.weight,
        circuitState: cbState?.state ?? "closed",
        allowedModels: upstream.allowedModels,
      };
    })
  );
}

/**
 * Route request to appropriate upstream based on model
 * Integrates circuit breaker filtering and returns candidate list
 */
export async function routeByModel(model: string): Promise<ModelRouterResult> {
  const originalModel = model;

  // Step 1: Determine provider type from model prefix
  const providerType = getProviderTypeForModel(model);

  if (!providerType) {
    return {
      upstream: null,
      providerType: null,
      resolvedModel: model,
      candidateUpstreams: [],
      excludedUpstreams: [],
      routingDecision: {
        originalModel,
        resolvedModel: model,
        providerType: null,
        upstreamName: null,
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "none",
        candidateCount: 0,
        finalCandidateCount: 0,
      },
    };
  }

  // Step 2: Get upstreams by provider type
  const { upstreams: upstreamList, routingType } = await getUpstreamsByProviderType(providerType);

  if (upstreamList.length === 0) {
    throw new NoUpstreamGroupError(model);
  }

  // Build candidate list for observability
  const allCandidates = await buildCandidateList(upstreamList);

  // Step 3: Filter upstreams by circuit breaker state
  const { allowed: healthyUpstreams, excluded: cbExcluded } =
    await filterUpstreamsByCircuitBreaker(upstreamList);

  // Step 4: Apply model redirects and filter by allowedModels
  let selectedUpstream: Upstream | null = null;
  let finalResolvedModel = model;
  let redirectApplied = false;
  const modelExcluded: ExcludedUpstream[] = [];
  let candidateCount = 0;

  for (const upstream of healthyUpstreams) {
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
      if (!selectedUpstream) {
        selectedUpstream = upstream;
        finalResolvedModel = resolvedModel;
        redirectApplied = wasRedirected;
      }
      candidateCount++;
    } else {
      modelExcluded.push({
        id: upstream.id,
        name: upstream.name,
        reason: "model_not_allowed",
      });
    }
  }

  // Combine all excluded upstreams
  const allExcluded = [...cbExcluded, ...modelExcluded];

  // Step 5: If no upstream supports the model, use first healthy upstream (fallback)
  const usingModelFilter = upstreamList.some((u) => u.allowedModels && u.allowedModels.length > 0);

  if (!selectedUpstream && healthyUpstreams.length > 0) {
    selectedUpstream = healthyUpstreams[0];
    const { resolvedModel } = resolveModelWithRedirects(model, selectedUpstream.modelRedirects);
    finalResolvedModel = resolvedModel;
    candidateCount = 1;
  }

  // If no healthy upstreams available, throw error
  if (!selectedUpstream) {
    throw new NoHealthyUpstreamError(model, providerType);
  }

  return {
    upstream: selectedUpstream,
    providerType,
    resolvedModel: finalResolvedModel,
    candidateUpstreams: allCandidates,
    excludedUpstreams: allExcluded,
    routingDecision: {
      originalModel,
      resolvedModel: finalResolvedModel,
      providerType,
      upstreamName: selectedUpstream?.name ?? null,
      allowedModelsFilter: usingModelFilter,
      modelRedirectApplied: redirectApplied,
      circuitBreakerFilter: cbExcluded.length > 0,
      routingType,
      candidateCount: upstreamList.length,
      finalCandidateCount: candidateCount,
    },
  };
}
