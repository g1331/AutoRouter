import { eq } from "drizzle-orm";
import { db, compensationRules } from "@/lib/db";
import { createLogger } from "@/lib/utils/logger";
import {
  normalizeCompensationRuleCapabilities,
  normalizeRouteCapabilitiesWithMeta,
  type RouteCapability,
} from "@/lib/route-capabilities";
import type { CompensationHeader } from "./proxy-client";

const log = createLogger("compensation-service");

const CACHE_TTL_MS = 60_000;

const BUILTIN_RULES = [
  {
    name: "Session ID Recovery",
    isBuiltin: true,
    enabled: true,
    capabilities: ["openai_responses", "codex_cli_responses"],
    targetHeader: "session_id",
    sources: [
      "headers.session_id",
      "headers.session-id",
      "headers.x-session-id",
      "body.prompt_cache_key",
      "body.metadata.session_id",
      "body.previous_response_id",
    ],
    mode: "missing_only",
  },
] as const;

interface CachedRules {
  rules: CompensationRule[];
  loadedAt: number;
}

export interface CompensationRule {
  id: string;
  name: string;
  isBuiltin: boolean;
  enabled: boolean;
  capabilities: RouteCapability[];
  targetHeader: string;
  sources: string[];
  mode: string;
}

let cache: CachedRules | null = null;
type BuiltinEnsureState = "unknown" | "ok" | "blocked";
let builtinEnsureState: BuiltinEnsureState = "unknown";
let builtinEnsureRetryAt = 0;
const BUILTIN_ENSURE_RETRY_MS = 60_000;
let capabilityMigrationCompleted = false;
let capabilityMigrationInFlight: Promise<void> | null = null;

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }

  return true;
}

async function runCompensationRuleCapabilityMigration(): Promise<void> {
  const rules = await db.query.compensationRules.findMany({
    columns: {
      id: true,
      name: true,
      capabilities: true,
    },
  });

  for (const rule of rules) {
    const persistedCapabilities = rule.capabilities ?? [];
    const normalizedResult = normalizeRouteCapabilitiesWithMeta(persistedCapabilities, {
      aliases: {
        codex_responses: ["openai_responses", "codex_cli_responses"],
      },
    });
    const normalizedCapabilities = normalizedResult.capabilities;
    const shouldUpdate =
      rule.capabilities == null || !arraysEqual(persistedCapabilities, normalizedCapabilities);

    if (!shouldUpdate) {
      continue;
    }

    await db
      .update(compensationRules)
      .set({
        capabilities: normalizedCapabilities,
        updatedAt: new Date(),
      })
      .where(eq(compensationRules.id, rule.id));

    if (normalizedResult.remappedValues.includes("codex_responses")) {
      log.warn(
        {
          ruleId: rule.id,
          ruleName: rule.name,
          routeCapabilities: normalizedCapabilities,
        },
        "compensation-service: migrated legacy codex_responses rule to openai_responses + codex_cli_responses"
      );
    } else if (normalizedResult.invalidValues.length > 0) {
      log.warn(
        {
          ruleId: rule.id,
          ruleName: rule.name,
          invalidValues: normalizedResult.invalidValues,
          routeCapabilities: normalizedCapabilities,
        },
        "compensation-service: removed invalid route capabilities from compensation rule"
      );
    } else {
      log.info(
        {
          ruleId: rule.id,
          ruleName: rule.name,
          routeCapabilities: normalizedCapabilities,
        },
        "compensation-service: normalized compensation rule capabilities"
      );
    }
  }
}

/**
 * Ensures legacy persisted compensation rule capabilities are normalized before rule loading.
 */
export async function ensureCompensationRuleCapabilityMigration(): Promise<void> {
  if (capabilityMigrationCompleted) {
    return;
  }

  if (capabilityMigrationInFlight) {
    await capabilityMigrationInFlight;
    return;
  }

  capabilityMigrationInFlight = runCompensationRuleCapabilityMigration()
    .then(() => {
      capabilityMigrationCompleted = true;
    })
    .catch((err) => {
      log.error({ err }, "compensation-service: failed to migrate compensation rule capabilities");
    })
    .finally(() => {
      capabilityMigrationInFlight = null;
    });

  await capabilityMigrationInFlight;
}

/**
 * Ensure built-in compensation rules exist and stay aligned with the hard-coded defaults.
 */
export async function ensureBuiltinCompensationRulesExist(): Promise<void> {
  if (builtinEnsureState === "ok") return;
  const now = Date.now();
  if (builtinEnsureState === "blocked" && now < builtinEnsureRetryAt) return;
  try {
    let blocked = false;
    for (const rule of BUILTIN_RULES) {
      const existing = await db
        .select({
          id: compensationRules.id,
          isBuiltin: compensationRules.isBuiltin,
        })
        .from(compensationRules)
        .where(eq(compensationRules.name, rule.name));

      if (existing.length === 0) {
        await db
          .insert(compensationRules)
          .values({
            name: rule.name,
            isBuiltin: rule.isBuiltin,
            enabled: rule.enabled,
            capabilities: [...rule.capabilities],
            targetHeader: rule.targetHeader,
            sources: [...rule.sources],
            mode: rule.mode,
          })
          .onConflictDoNothing();
        continue;
      }

      if (!existing[0].isBuiltin) {
        log.error(
          { name: rule.name },
          "compensation-service: builtin rule name is used by a non-builtin rule, skipping ensure"
        );
        blocked = true;
        continue;
      }

      await db
        .update(compensationRules)
        .set({
          capabilities: [...rule.capabilities],
          targetHeader: rule.targetHeader,
          sources: [...rule.sources],
          mode: rule.mode,
        })
        .where(eq(compensationRules.id, existing[0].id));
    }
    if (blocked) {
      builtinEnsureState = "blocked";
      builtinEnsureRetryAt = Date.now() + BUILTIN_ENSURE_RETRY_MS;
      return;
    }
    builtinEnsureState = "ok";
  } catch (err) {
    log.error({ err }, "compensation-service: failed to ensure builtin rules exist");
    builtinEnsureState = "blocked";
    builtinEnsureRetryAt = Date.now() + BUILTIN_ENSURE_RETRY_MS;
  }
}

async function loadRules(): Promise<CompensationRule[]> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.rules;
  }

  await ensureBuiltinCompensationRulesExist();
  await ensureCompensationRuleCapabilityMigration();

  const rows = await db.select().from(compensationRules).where(eq(compensationRules.enabled, true));
  const rules: CompensationRule[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    isBuiltin: r.isBuiltin,
    enabled: r.enabled,
    capabilities: normalizeCompensationRuleCapabilities(r.capabilities),
    targetHeader: r.targetHeader,
    sources: r.sources as string[],
    mode: r.mode,
  }));

  cache = { rules, loadedAt: now };
  return rules;
}

/**
 * Clear the in-memory compensation rule cache so the next lookup reloads from storage.
 */
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
