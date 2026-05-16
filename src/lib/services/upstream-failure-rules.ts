import { asc, eq, isNull, or } from "drizzle-orm";
import { db, upstreamFailureRules, upstreams, type UpstreamFailureRule } from "@/lib/db";
import type { FailoverErrorType } from "@/types/api";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("upstream-failure-rules");

export interface UpstreamFailureRuleMatch {
  statusCodes?: number[] | null;
  errorTypes?: string[] | null;
  bodyPattern?: string | null;
  headerName?: string | null;
  headerPattern?: string | null;
}

export interface UpstreamFailureRuleInput {
  upstreamId?: string | null;
  name: string;
  enabled?: boolean;
  priority?: number;
  match: UpstreamFailureRuleMatch;
}

export interface UpstreamFailureRuleUpdateInput {
  name?: string;
  enabled?: boolean;
  priority?: number;
  match?: UpstreamFailureRuleMatch;
}

export interface FailureEvidence {
  upstreamId: string;
  statusCode?: number | null;
  errorType?: FailoverErrorType | string | null;
  responseHeaders?: Headers | Record<string, string> | null;
  responseBodyText?: string | null;
  errorMessage?: string | null;
}

export interface MatchedFailureRule {
  id: string;
  name: string;
  scope: "global" | "upstream";
}

export class InvalidFailureRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFailureRuleError";
  }
}

function hasMatchCondition(match: UpstreamFailureRuleMatch): boolean {
  return Boolean(
    match.statusCodes?.length ||
    match.errorTypes?.length ||
    match.bodyPattern?.trim() ||
    (match.headerName?.trim() && match.headerPattern?.trim())
  );
}

function assertValidRuleMatch(match: UpstreamFailureRuleMatch): void {
  if (!hasMatchCondition(match)) {
    throw new InvalidFailureRuleError("At least one failure rule condition is required");
  }

  if (match.bodyPattern?.trim()) {
    try {
      new RegExp(match.bodyPattern);
    } catch {
      throw new InvalidFailureRuleError("body_pattern must be a valid regular expression");
    }
  }

  if (match.headerPattern?.trim()) {
    try {
      new RegExp(match.headerPattern);
    } catch {
      throw new InvalidFailureRuleError("header_pattern must be a valid regular expression");
    }
  }
}

function normalizeRuleMatch(match: UpstreamFailureRuleMatch): UpstreamFailureRuleMatch {
  return {
    statusCodes: match.statusCodes?.length ? [...new Set(match.statusCodes)] : null,
    errorTypes: match.errorTypes?.length ? [...new Set(match.errorTypes)] : null,
    bodyPattern: match.bodyPattern?.trim() || null,
    headerName: match.headerName?.trim() || null,
    headerPattern: match.headerPattern?.trim() || null,
  };
}

function readHeader(
  headers: FailureEvidence["responseHeaders"],
  headerName: string | null | undefined
): string | null {
  const normalizedHeaderName = headerName?.trim().toLowerCase();
  if (!headers || !normalizedHeaderName) {
    return null;
  }

  if (headers instanceof Headers) {
    return headers.get(normalizedHeaderName);
  }

  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === normalizedHeaderName) {
      return value;
    }
  }

  return null;
}

function testRegex(pattern: string, value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    return new RegExp(pattern).test(value);
  } catch (error) {
    log.warn({ err: error, pattern }, "invalid failure rule regex skipped");
    return false;
  }
}

function ruleMatchesEvidence(rule: UpstreamFailureRule, evidence: FailureEvidence): boolean {
  const match = rule.match as UpstreamFailureRuleMatch;

  if (match.statusCodes?.length && !match.statusCodes.includes(evidence.statusCode ?? 0)) {
    return false;
  }

  if (match.errorTypes?.length && !match.errorTypes.includes(evidence.errorType ?? "")) {
    return false;
  }

  if (match.bodyPattern) {
    const bodyOrMessage = evidence.responseBodyText ?? evidence.errorMessage ?? "";
    if (!testRegex(match.bodyPattern, bodyOrMessage)) {
      return false;
    }
  }

  if (match.headerName && match.headerPattern) {
    const headerValue = readHeader(evidence.responseHeaders, match.headerName);
    if (!testRegex(match.headerPattern, headerValue)) {
      return false;
    }
  }

  return hasMatchCondition(match);
}

export function formatFailureRule(rule: UpstreamFailureRule): {
  id: string;
  upstream_id: string | null;
  name: string;
  enabled: boolean;
  priority: number;
  match: {
    status_codes?: number[] | null;
    error_types?: string[] | null;
    body_pattern?: string | null;
    header_name?: string | null;
    header_pattern?: string | null;
  };
  created_at: string;
  updated_at: string;
} {
  const match = rule.match as UpstreamFailureRuleMatch;
  return {
    id: rule.id,
    upstream_id: rule.upstreamId,
    name: rule.name,
    enabled: rule.enabled,
    priority: rule.priority,
    match: {
      status_codes: match.statusCodes ?? null,
      error_types: match.errorTypes ?? null,
      body_pattern: match.bodyPattern ?? null,
      header_name: match.headerName ?? null,
      header_pattern: match.headerPattern ?? null,
    },
    created_at: rule.createdAt.toISOString(),
    updated_at: rule.updatedAt.toISOString(),
  };
}

export function parseFailureRuleMatch(input: {
  status_codes?: number[] | null;
  error_types?: string[] | null;
  body_pattern?: string | null;
  header_name?: string | null;
  header_pattern?: string | null;
}): UpstreamFailureRuleMatch {
  return {
    statusCodes: input.status_codes ?? null,
    errorTypes: input.error_types ?? null,
    bodyPattern: input.body_pattern ?? null,
    headerName: input.header_name ?? null,
    headerPattern: input.header_pattern ?? null,
  };
}

export async function listFailureRules(upstreamId?: string | null): Promise<UpstreamFailureRule[]> {
  return db.query.upstreamFailureRules.findMany({
    where:
      upstreamId === undefined
        ? undefined
        : upstreamId === null
          ? isNull(upstreamFailureRules.upstreamId)
          : eq(upstreamFailureRules.upstreamId, upstreamId),
    orderBy: [asc(upstreamFailureRules.priority), asc(upstreamFailureRules.createdAt)],
  });
}

export async function createFailureRule(
  input: UpstreamFailureRuleInput
): Promise<UpstreamFailureRule> {
  const match = normalizeRuleMatch(input.match);
  assertValidRuleMatch(match);

  if (input.upstreamId) {
    const upstream = await db.query.upstreams.findFirst({
      where: eq(upstreams.id, input.upstreamId),
    });
    if (!upstream) {
      throw new InvalidFailureRuleError(`Upstream not found: ${input.upstreamId}`);
    }
  }

  const now = new Date();
  const [created] = await db
    .insert(upstreamFailureRules)
    .values({
      upstreamId: input.upstreamId ?? null,
      name: input.name,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 0,
      match,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
}

export async function updateFailureRule(
  id: string,
  input: UpstreamFailureRuleUpdateInput
): Promise<UpstreamFailureRule | null> {
  const updateValues: Partial<typeof upstreamFailureRules.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateValues.name = input.name;
  if (input.enabled !== undefined) updateValues.enabled = input.enabled;
  if (input.priority !== undefined) updateValues.priority = input.priority;
  if (input.match !== undefined) {
    const match = normalizeRuleMatch(input.match);
    assertValidRuleMatch(match);
    updateValues.match = match;
  }

  const [updated] = await db
    .update(upstreamFailureRules)
    .set(updateValues)
    .where(eq(upstreamFailureRules.id, id))
    .returning();

  return updated ?? null;
}

export async function deleteFailureRule(id: string): Promise<boolean> {
  const deleted = await db.delete(upstreamFailureRules).where(eq(upstreamFailureRules.id, id));
  return Array.isArray(deleted) ? deleted.length > 0 : true;
}

export async function matchFailureRule(
  evidence: FailureEvidence
): Promise<MatchedFailureRule | null> {
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, evidence.upstreamId),
  });

  if (!upstream) {
    return null;
  }

  const useGlobalRules = upstream.failureRuleConfig?.useGlobalRules !== false;
  const rules = await db.query.upstreamFailureRules.findMany({
    where: useGlobalRules
      ? or(
          isNull(upstreamFailureRules.upstreamId),
          eq(upstreamFailureRules.upstreamId, upstream.id)
        )
      : eq(upstreamFailureRules.upstreamId, upstream.id),
    orderBy: [asc(upstreamFailureRules.priority), asc(upstreamFailureRules.createdAt)],
  });

  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }

    if (ruleMatchesEvidence(rule, evidence)) {
      return {
        id: rule.id,
        name: rule.name,
        scope: rule.upstreamId ? "upstream" : "global",
      };
    }
  }

  return null;
}
