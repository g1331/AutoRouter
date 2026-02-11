/**
 * Session Affinity Module
 *
 * Provides in-memory session-to-upstream binding with TTL management
 * and automatic cleanup for AI API Gateway prompt cache optimization.
 */

import { createHash } from "crypto";
import type { ProviderType } from "@/types/api";

// ============================================================================
// Types
// ============================================================================

export interface AffinityEntry {
  upstreamId: string;
  lastAccessedAt: number;
  createdAt: number; // For max TTL calculation (absolute lifetime)
  contentLength: number;
  cumulativeTokens: number;
}

export interface AffinityUsage {
  totalInputTokens: number;
}

export interface AffinityMigrationConfig {
  enabled: boolean;
  metric: "tokens" | "length";
  threshold: number;
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

// ============================================================================
// Session Affinity Store
// ============================================================================

export class SessionAffinityStore {
  private cache = new Map<string, AffinityEntry>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private defaultTtlMs: number = DEFAULT_TTL_MS,
    private maxTtlMs: number = MAX_TTL_MS
  ) {
    this.startCleanupTimer();
  }

  /**
   * Generate cache key from API key ID, provider type, and session ID
   */
  private generateKey(apiKeyId: string, providerType: ProviderType, sessionId: string): string {
    const data = `${apiKeyId}:${providerType}:${sessionId}`;
    return createHash("sha256").update(data).digest("hex");
  }

  /**
   * Get affinity entry for a session
   */
  get(apiKeyId: string, providerType: ProviderType, sessionId: string): AffinityEntry | null {
    const key = this.generateKey(apiKeyId, providerType, sessionId);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = now - entry.lastAccessedAt;
    const lifetime = now - entry.createdAt;

    // Check if entry has expired (sliding window TTL)
    if (age > this.defaultTtlMs) {
      this.cache.delete(key);
      return null;
    }

    // Check max TTL limit (absolute lifetime, regardless of activity)
    if (lifetime > this.maxTtlMs) {
      this.cache.delete(key);
      return null;
    }

    // Refresh last accessed time (sliding window)
    entry.lastAccessedAt = now;

    return entry;
  }

  /**
   * Set or update affinity entry for a session
   */
  set(
    apiKeyId: string,
    providerType: ProviderType,
    sessionId: string,
    upstreamId: string,
    contentLength: number
  ): void {
    const key = this.generateKey(apiKeyId, providerType, sessionId);
    const now = Date.now();

    // Check if entry exists to preserve cumulative tokens
    const existing = this.cache.get(key);
    const cumulativeTokens = existing ? existing.cumulativeTokens : 0;

    this.cache.set(key, {
      upstreamId,
      lastAccessedAt: now,
      createdAt: existing ? existing.createdAt : now,
      contentLength,
      cumulativeTokens,
    });
  }

  /**
   * Update cumulative tokens for a session after response
   */
  updateCumulativeTokens(
    apiKeyId: string,
    providerType: ProviderType,
    sessionId: string,
    usage: AffinityUsage
  ): void {
    const key = this.generateKey(apiKeyId, providerType, sessionId);
    const entry = this.cache.get(key);

    if (!entry) {
      return;
    }

    // Calculate total input tokens including cache tokens
    entry.cumulativeTokens += usage.totalInputTokens;
  }

  /**
   * Delete affinity entry
   */
  delete(apiKeyId: string, providerType: ProviderType, sessionId: string): boolean {
    const key = this.generateKey(apiKeyId, providerType, sessionId);
    return this.cache.delete(key);
  }

  /**
   * Check if affinity exists and is valid
   */
  has(apiKeyId: string, providerType: ProviderType, sessionId: string): boolean {
    return this.get(apiKeyId, providerType, sessionId) !== null;
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

// ============================================================================
// Session ID Extraction
// ============================================================================

/**
 * Extract session ID from request based on provider type
 *
 * Anthropic: Extracts UUID from body.metadata.user_id (format: "..._session_{uuid}")
 * OpenAI: Uses headers.session_id directly
 * Others: Returns null
 */
export function extractSessionId(
  providerType: ProviderType,
  headers: Record<string, string | string[] | undefined>,
  bodyJson: Record<string, unknown> | null
): string | null {
  switch (providerType) {
    case "anthropic":
      return extractAnthropicSessionId(bodyJson);
    case "openai":
      return extractOpenAISessionId(headers);
    default:
      return null;
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
  const match = userId.match(/_session_([a-f0-9-]{36})/i);
  if (match) {
    return match[1].toLowerCase();
  }

  return null;
}

/**
 * Extract session ID from OpenAI request
 * Uses session_id header directly
 */
function extractOpenAISessionId(
  headers: Record<string, string | string[] | undefined>
): string | null {
  const sessionId = headers["session_id"];

  if (typeof sessionId === "string" && sessionId.length > 0) {
    return sessionId;
  }

  return null;
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
