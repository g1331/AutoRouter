import type { CliproxyApiProvider, CliproxyApiUpstreamConfig } from "@/types/api";

interface UpstreamConfigEnvelope {
  cliproxyapi?: Partial<CliproxyApiUpstreamConfig> | null;
  [key: string]: unknown;
}

function isProvider(value: unknown): value is CliproxyApiProvider {
  return value === "codex" || value === "claude" || value === "gemini";
}

/**
 * Extract CLIProxyAPI metadata from an upstream config JSON string.
 */
export function parseCliproxyApiUpstreamConfig(
  config: string | null | undefined
): CliproxyApiUpstreamConfig | null {
  if (!config) return null;

  try {
    const parsed = JSON.parse(config) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const envelope = parsed as UpstreamConfigEnvelope;
    const candidate = envelope.cliproxyapi;
    if (!candidate || typeof candidate !== "object") return null;
    if (typeof candidate.connection_id !== "string" || !candidate.connection_id.trim()) {
      return null;
    }
    if (!isProvider(candidate.provider)) return null;

    const poolMode = candidate.pool_mode === "account" ? "account" : "pool";
    return {
      connection_id: candidate.connection_id,
      provider: candidate.provider,
      pool_mode: poolMode,
      account_prefix:
        typeof candidate.account_prefix === "string" && candidate.account_prefix.trim()
          ? candidate.account_prefix.trim()
          : null,
    };
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

/**
 * Merge CLIProxyAPI metadata into an upstream config JSON string while preserving unrelated keys.
 */
export function mergeCliproxyApiUpstreamConfig(
  config: string | null | undefined,
  cliproxyapi: CliproxyApiUpstreamConfig | null | undefined
): string | null {
  let envelope: UpstreamConfigEnvelope = {};
  if (config) {
    try {
      const parsed = JSON.parse(config) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        envelope = parsed as UpstreamConfigEnvelope;
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }

  if (cliproxyapi) {
    envelope.cliproxyapi = cliproxyapi;
  } else if (cliproxyapi === null) {
    delete envelope.cliproxyapi;
  }

  return Object.keys(envelope).length > 0 ? JSON.stringify(envelope) : null;
}
