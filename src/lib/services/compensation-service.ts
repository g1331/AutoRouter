import { eq } from "drizzle-orm";
import { db, compensationRules } from "@/lib/db";
import { createLogger } from "@/lib/utils/logger";
import type { RouteCapability } from "@/lib/route-capabilities";
import type { CompensationHeader } from "./proxy-client";

const log = createLogger("compensation-service");

const CACHE_TTL_MS = 60_000;

interface CachedRules {
  rules: CompensationRule[];
  loadedAt: number;
}

export interface CompensationRule {
  id: string;
  name: string;
  isBuiltin: boolean;
  enabled: boolean;
  capabilities: string[];
  targetHeader: string;
  sources: string[];
  mode: string;
}

let cache: CachedRules | null = null;

async function loadRules(): Promise<CompensationRule[]> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.rules;
  }

  const rows = await db.select().from(compensationRules).where(eq(compensationRules.enabled, true));
  const rules: CompensationRule[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    isBuiltin: r.isBuiltin,
    enabled: r.enabled,
    capabilities: r.capabilities as string[],
    targetHeader: r.targetHeader,
    sources: r.sources as string[],
    mode: r.mode,
  }));

  cache = { rules, loadedAt: now };
  return rules;
}

export function invalidateCache(): void {
  cache = null;
}

const SOURCE_PATTERN = /^(headers|body)\..+$/;

function resolveSource(
  source: string,
  headers: Record<string, string | string[] | undefined>,
  body: Record<string, unknown> | null
): string | null {
  if (!SOURCE_PATTERN.test(source)) {
    log.warn({ source }, "compensation-service: invalid source path, skipping");
    return null;
  }

  const dotIndex = source.indexOf(".");
  const kind = source.slice(0, dotIndex);
  const path = source.slice(dotIndex + 1);

  if (kind === "headers") {
    const val = headers[path];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
    return null;
  }

  if (kind === "body" && body !== null) {
    const parts = path.split(".");
    let current: unknown = body;
    for (const part of parts) {
      if (current === null || typeof current !== "object" || Array.isArray(current)) {
        return null;
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (typeof current === "string" && current.trim().length > 0) {
      return current.trim();
    }
    return null;
  }

  return null;
}

/**
 * Build the list of compensation headers to inject for the given capability.
 * Each rule is evaluated independently; the first source that resolves wins.
 */
export async function buildCompensations(
  capability: RouteCapability,
  headers: Record<string, string | string[] | undefined>,
  body: Record<string, unknown> | null
): Promise<CompensationHeader[]> {
  let rules: CompensationRule[];
  try {
    rules = await loadRules();
  } catch (err) {
    log.error({ err }, "compensation-service: failed to load rules, skipping compensation");
    return [];
  }

  const result: CompensationHeader[] = [];

  for (const rule of rules) {
    if (!rule.capabilities.includes(capability)) continue;

    for (const source of rule.sources) {
      const value = resolveSource(source, headers, body);
      if (value !== null) {
        result.push({ header: rule.targetHeader, value, source });
        break;
      }
    }
  }

  return result;
}
