/**
 * Session Affinity Module
 *
 * Provides in-memory session-to-upstream binding with TTL management
 * and automatic cleanup for AI API Gateway prompt cache optimization.
 */

import { createHmac, randomBytes } from "crypto";
import type { RouteCapability } from "@/lib/route-capabilities";
import type { AffinityBindingState } from "@/types/api";

// ============================================================================
// Types
// ============================================================================

export interface AffinityEntry {
  upstreamId: string;
  lastAccessedAt: number;
  createdAt: number; // For max TTL calculation (absolute lifetime)
  contentLength: number;
  cumulativeTokens: number;
  bindingVersion: number;
}

export interface AffinityUsage {
  totalInputTokens: number;
}

export interface AffinityMigrationConfig {
  enabled: boolean;
  metric: "tokens" | "length";
  threshold: number;
}

export type AffinityScope = RouteCapability;

export interface AffinityBindingExpectation {
  initialUpstreamId: string | null;
  initialBindingVersion: number | null;
}

export interface AffinityCommitResult {
  committed: boolean;
  current: AffinityEntry | null;
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
const MAX_CACHE_ENTRIES = 10_000;
const SESSION_AFFINITY_KEY = randomBytes(32);

// ============================================================================
// Session Affinity Store
// ============================================================================

/**
 * Maintain in-memory session-affinity bindings between sessions and upstreams.
 */
export class SessionAffinityStore {
  private cache = new Map<string, AffinityEntry>();
  private nextBindingVersion = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private defaultTtlMs: number = DEFAULT_TTL_MS,
    private maxTtlMs: number = MAX_TTL_MS,
    private maxEntries: number = MAX_CACHE_ENTRIES
  ) {
    this.startCleanupTimer();
  }

  /**
   * Generate cache key from API key ID, affinity scope, and session ID
   */
  private generateKey(apiKeyId: string, affinityScope: AffinityScope, sessionId: string): string {
    const data = `${apiKeyId}:${affinityScope}:${sessionId}`;
    // lgtm[js/insufficient-password-hash] - HMAC derives an ephemeral cache key, not a password hash.
    return createHmac("sha256", SESSION_AFFINITY_KEY).update(data).digest("hex");
  }
  private getValidEntry(key: string, now: number): AffinityEntry | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const age = now - entry.lastAccessedAt;
    const lifetime = now - entry.createdAt;
    if (age > this.defaultTtlMs || lifetime > this.maxTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  /**
   * Get affinity entry for a session
   */
  get(apiKeyId: string, affinityScope: AffinityScope, sessionId: string): AffinityEntry | null {
    const entry = this.peek(apiKeyId, affinityScope, sessionId);
    if (!entry) {
      return null;
    }

    entry.lastAccessedAt = Date.now();
    return entry;
  }

  /**
   * Read an affinity entry without refreshing its sliding TTL.
   */
  peek(apiKeyId: string, affinityScope: AffinityScope, sessionId: string): AffinityEntry | null {
    const key = this.generateKey(apiKeyId, affinityScope, sessionId);
    return this.getValidEntry(key, Date.now());
  }

  /**
   * Refresh an existing affinity entry after a successful terminal response.
   */
  touch(apiKeyId: string, affinityScope: AffinityScope, sessionId: string): boolean {
    const entry = this.peek(apiKeyId, affinityScope, sessionId);
    if (!entry) {
      return false;
    }

    entry.lastAccessedAt = Date.now();
    return true;
  }

  /**
   * Set or update affinity entry for a session
   */
  set(
    apiKeyId: string,
    affinityScope: AffinityScope,
    sessionId: string,
    upstreamId: string,
    contentLength: number
  ): void {
    const key = this.generateKey(apiKeyId, affinityScope, sessionId);
    const now = Date.now();
    const existing = this.getValidEntry(key, now);

    this.cache.set(key, {
      upstreamId,
      lastAccessedAt: now,
      createdAt: existing ? existing.createdAt : now,
      contentLength,
      cumulativeTokens: existing?.cumulativeTokens ?? 0,
      bindingVersion: ++this.nextBindingVersion,
    });

    if (this.cache.size > this.maxEntries) {
      this.evictOldest();
    }
  }

  /**
   * Commit a binding only if the selection observed the same binding state.
   */
  commitIfCurrent(
    apiKeyId: string,
    affinityScope: AffinityScope,
    sessionId: string,
    expectedBindingVersion: number | null,
    upstreamId: string,
    contentLength: number
  ): AffinityCommitResult {
    const key = this.generateKey(apiKeyId, affinityScope, sessionId);
    const current = this.getValidEntry(key, Date.now());
    const canCommit =
      expectedBindingVersion === null ||
      current === null ||
      current.bindingVersion === expectedBindingVersion;

    if (!canCommit) {
      return { committed: false, current };
    }

    this.set(apiKeyId, affinityScope, sessionId, upstreamId, contentLength);
    return { committed: true, current: this.cache.get(key) ?? null };
  }

  /**
   * Update cumulative tokens for a session after response
   */
  updateCumulativeTokens(
    apiKeyId: string,
    affinityScope: AffinityScope,
    sessionId: string,
    usage: AffinityUsage
  ): void {
    const key = this.generateKey(apiKeyId, affinityScope, sessionId);
    const entry = this.getValidEntry(key, Date.now());

    if (!entry) {
      return;
    }

    if (Number.isFinite(usage.totalInputTokens) && usage.totalInputTokens > 0) {
      entry.cumulativeTokens += usage.totalInputTokens;
    }

    // Refresh TTL only from a successful terminal settlement.
    entry.lastAccessedAt = Date.now();
  }

  /**
   * Delete affinity entry
   */
  delete(apiKeyId: string, affinityScope: AffinityScope, sessionId: string): boolean {
    const key = this.generateKey(apiKeyId, affinityScope, sessionId);
    return this.cache.delete(key);
  }

  /**
   * Check if affinity exists and is valid
   */
  has(apiKeyId: string, affinityScope: AffinityScope, sessionId: string): boolean {
    return this.peek(apiKeyId, affinityScope, sessionId) !== null;
  }

  /**
   * Get all entries (for debugging/testing)
   */
  getAllEntries(): Map<string, AffinityEntry> {
    return new Map(this.cache);
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Evict the least recently accessed entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.lastAccessedAt;
      const lifetime = now - entry.createdAt;
      // Check both sliding window TTL and absolute max lifetime
      if (age > this.defaultTtlMs || lifetime > this.maxTtlMs) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);

    // Allow Node.js to exit if this is the only timer
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Dispose store and cleanup resources
   */
  dispose(): void {
    this.stopCleanupTimer();
    this.clear();
  }
}

/** Calculate the input-token contribution used by affinity migration. */
export function computeAffinityTokens(
  routeCapability: RouteCapability,
  usage: {
    promptTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    rawInputTokens?: number;
  }
): number {
  const prompt = usage.promptTokens || 0;

  if (routeCapability !== "anthropic_messages" && routeCapability !== "claude_code_messages") {
    return prompt;
  }

  const rawInput = usage.rawInputTokens ?? 0;
  const cacheRead = usage.cacheReadTokens || 0;
  const cacheCreation = usage.cacheCreationTokens || 0;

  return rawInput > 0 ? rawInput + cacheRead + cacheCreation : prompt;
}

/**
 * Commit the selected binding only after a successful terminal response.
 */
export function commitAffinityBindingAfterSuccess(input: {
  apiKeyId: string;
  affinityScope: AffinityScope;
  sessionId: string | null;
  contentLength: number;
  expectation: AffinityBindingExpectation | null;
  selectedUpstreamId: string;
  affinityMigrated: boolean;
}): AffinityBindingState | null {
  if (!input.sessionId || !input.expectation) {
    return null;
  }

  const { initialUpstreamId, initialBindingVersion } = input.expectation;
  const intendedState: AffinityBindingState =
    initialUpstreamId === null
      ? "created"
      : input.selectedUpstreamId === initialUpstreamId
        ? "unchanged"
        : input.affinityMigrated
          ? "migrated"
          : "reselected";
  const commit = affinityStore.commitIfCurrent(
    input.apiKeyId,
    input.affinityScope,
    input.sessionId,
    initialBindingVersion,
    input.selectedUpstreamId,
    input.contentLength
  );

  if (commit.committed) {
    return intendedState;
  }

  if (commit.current) {
    affinityStore.touch(input.apiKeyId, input.affinityScope, input.sessionId);
    return "unchanged";
  }

  return intendedState;
}

/** Resolve the terminal binding state when no binding commit occurred. */
export function resolveAffinityFailureBindingState(
  expectation: AffinityBindingExpectation | null
): AffinityBindingState | null {
  if (!expectation) {
    return null;
  }

  return expectation.initialUpstreamId === null ? "none" : "unchanged";
}

// ============================================================================
// Session ID Extraction
// ============================================================================

export interface SessionIdResult {
  sessionId: string | null;
  source: "header" | "body" | null;
}

/**
 * Extract session ID from request based on route capability.
 *
 * Anthropic: Extracts a UUID from `body.metadata.user_id`, for example `..._session_[uuid]`.
 * OpenAI compatible capabilities: Uses headers.session_id directly, with body fallbacks
 * Others: Returns null
 */
export function extractSessionId(
  capability: RouteCapability,
  headers: Record<string, string | string[] | undefined>,
  bodyJson: Record<string, unknown> | null
): SessionIdResult {
  switch (capability) {
    case "anthropic_messages":
    case "claude_code_messages": {
      const sessionId = extractAnthropicSessionId(bodyJson);
      return { sessionId, source: sessionId ? "body" : null };
    }
    case "openai_responses":
    case "codex_cli_responses":
    case "openai_chat_compatible":
    case "openai_extended":
      return extractOpenAISessionId(headers, bodyJson);
    default:
      return { sessionId: null, source: null };
  }
}

/**
 * Extract session ID from Anthropic request
 * Looks for session UUID in body.metadata.user_id
 */
function extractAnthropicSessionId(bodyJson: Record<string, unknown> | null): string | null {
  if (!bodyJson) {
    return null;
  }

  const metadata = bodyJson.metadata as Record<string, unknown> | undefined;
  if (!metadata) {
    return null;
  }

  const userId = metadata.user_id;
  if (typeof userId !== "string") {
    return null;
  }

  // Extract UUID from "..._session_{uuid}" format
  const match = userId.match(/(?:^|_)session_([a-f0-9-]{36})/i);
  if (match) {
    return match[1].toLowerCase();
  }

  return null;
}

const MAX_SESSION_ID_LENGTH = 128;

/**
 * Extract session ID from OpenAI request
 * Priority:
 * 1) headers.session_id / headers.session-id
 * 2) headers.x-session-id / headers.x-session_id
 * 3) body.prompt_cache_key
 * 4) body.metadata.session_id
 * 5) body.previous_response_id
 */
function extractOpenAISessionId(
  headers: Record<string, string | string[] | undefined>,
  bodyJson: Record<string, unknown> | null
): SessionIdResult {
  const headerCandidates: Array<string | string[] | undefined> = [
    headers["session_id"],
    headers["session-id"],
    headers["x-session-id"],
    headers["x-session_id"],
    headers["x_session_id"],
  ];

  for (const candidate of headerCandidates) {
    const sessionId = normalizeSessionId(candidate);
    if (sessionId) {
      return { sessionId, source: "header" };
    }
  }

  const bodyCandidates: unknown[] = [];
  if (bodyJson) {
    bodyCandidates.push(bodyJson.prompt_cache_key);
    const metadata = bodyJson.metadata;
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      bodyCandidates.push((metadata as Record<string, unknown>).session_id);
    }
    bodyCandidates.push(bodyJson.previous_response_id);
  }

  for (const candidate of bodyCandidates) {
    const sessionId = normalizeSessionId(candidate);
    if (sessionId) {
      return { sessionId, source: "body" };
    }
  }

  return { sessionId: null, source: null };
}

function normalizeSessionId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const sessionId = value.trim();
  if (sessionId.length === 0 || sessionId.length > MAX_SESSION_ID_LENGTH) {
    return null;
  }

  return sessionId;
}

// ============================================================================
// Migration Evaluation
// ============================================================================

export interface UpstreamCandidate {
  id: string;
  priority: number;
  affinityMigration: AffinityMigrationConfig | null;
}

/**
 * Evaluate whether a session should migrate to a higher priority upstream
 *
 * Migration conditions (all must be met):
 * 1. Current upstream is not the highest priority available
 * 2. A higher priority upstream has affinityMigration.enabled = true
 * 3. The session's conversation size is below the threshold
 */
export function shouldMigrate(
  currentUpstream: UpstreamCandidate,
  candidates: UpstreamCandidate[],
  contentLength: number,
  cumulativeTokens: number
): UpstreamCandidate | null {
  // Find available higher priority upstreams (lower number = higher priority)
  const higherPriorityCandidates = candidates.filter((c) => c.priority < currentUpstream.priority);

  if (higherPriorityCandidates.length === 0) {
    // Current upstream is already highest priority
    return null;
  }

  // Find the highest priority upstream with migration enabled
  const targetUpstream = higherPriorityCandidates
    .filter((c) => c.affinityMigration?.enabled === true)
    .sort((a, b) => a.priority - b.priority)[0];

  if (!targetUpstream) {
    // No higher priority upstream accepts migrations
    return null;
  }

  const config = targetUpstream.affinityMigration!;

  // Evaluate based on metric
  let conversationSize: number;
  if (config.metric === "tokens") {
    conversationSize = cumulativeTokens;
  } else {
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      return null;
    }
    conversationSize = contentLength;
  }

  // Check threshold
  if (conversationSize < config.threshold) {
    return targetUpstream;
  }

  return null;
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const affinityStore = new SessionAffinityStore();
