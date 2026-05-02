import { and, desc, eq } from "drizzle-orm";
import { db, upstreamProbeResults, upstreams, type UpstreamProbeResult } from "@/lib/db";
import {
  getFallbackRouteCapability,
  getProviderByRouteCapability,
  isRouteCapability,
  normalizeRouteCapabilities,
  type RouteCapability,
} from "@/lib/route-capabilities";
import { normalizeApiRoot } from "./upstream-model-discovery";
import { getDecryptedApiKey, UpstreamNotFoundError } from "./upstream-crud";
import { isUrlSafe, resolveAndValidateHostname } from "./upstream-ssrf-validator";

export type UpstreamProbeClientProfile =
  | "generic_openai"
  | "generic_anthropic"
  | "codex_cli"
  | "claude_code";

export type UpstreamProbeStatus =
  | "ok"
  | "transport_failed"
  | "auth_failed"
  | "rate_limited"
  | "quota_exhausted"
  | "model_unavailable"
  | "protocol_mismatch"
  | "business_failed"
  | "upstream_error"
  | "configuration_error"
  | "route_unavailable"
  | "template_unavailable";

export type UpstreamProbeLayer =
  | "configuration"
  | "transport"
  | "auth"
  | "protocol"
  | "business"
  | "router";

export interface ExecuteUpstreamProbeInput {
  upstreamId: string;
  routeCapability?: RouteCapability;
  clientProfile?: UpstreamProbeClientProfile;
  model?: string;
}

export interface UpstreamProbeResponse {
  id: string;
  upstream_id: string;
  upstream_name?: string;
  route_capability: RouteCapability;
  client_profile: UpstreamProbeClientProfile;
  probe_template_id: string;
  probe_kind: string;
  status: UpstreamProbeStatus;
  layer: UpstreamProbeLayer;
  success: boolean;
  latency_ms: number | null;
  first_byte_latency_ms: number | null;
  completed_latency_ms: number | null;
  status_code: number | null;
  error_type: string | null;
  error_message: string | null;
  response_body: string | null;
  probe_url: string | null;
  model: string | null;
  checked_at: string;
}

export interface UpstreamProbeListResponse {
  data: UpstreamProbeResponse[];
  total: number;
}

interface ProbeResultIdentity {
  id: string;
  routeCapability: RouteCapability;
  clientProfile: UpstreamProbeClientProfile;
  probeKind: "cli_real_request" | "openai_responses" | "anthropic_messages" | "router";
}

interface ProbeTemplate extends ProbeResultIdentity {
  path: string;
  headers: (apiKey: string) => Record<string, string>;
  body: (model: string) => Record<string, unknown>;
  completeEvent: string;
  failureEvents: string[];
  defaultModel: string;
}

interface ProbeExecutionResult {
  status: UpstreamProbeStatus;
  layer: UpstreamProbeLayer;
  success: boolean;
  latencyMs: number | null;
  firstByteLatencyMs: number | null;
  completedLatencyMs: number | null;
  statusCode: number | null;
  errorType: string | null;
  errorMessage: string | null;
  responseBody: string | null;
}

function normalizeProbeResponseBody(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

const PROBE_TEMPLATES: ProbeTemplate[] = [
  {
    id: "codex_cli_responses_stream_v1",
    routeCapability: "codex_cli_responses",
    clientProfile: "codex_cli",
    probeKind: "cli_real_request",
    path: "responses",
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      originator: "codex_cli_rs",
      "User-Agent": "codex_cli_rs/diagnostic-probe",
      session_id: "autorouter-diagnostic-probe",
      "x-codex-beta-features": "collab",
      "x-codex-turn-metadata": JSON.stringify({ source: "autorouter-diagnostic-probe" }),
    }),
    body: (model) => ({
      model,
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Reply with exactly: OK" }],
        },
      ],
      tools: [],
      tool_choice: "auto",
      parallel_tool_calls: false,
      reasoning: null,
      stream: true,
      store: false,
      include: [],
    }),
    completeEvent: "response.completed",
    failureEvents: ["response.failed", "response.incomplete", "error"],
    defaultModel: "gpt-5.4-mini",
  },
  {
    id: "openai_responses_stream_v1",
    routeCapability: "openai_responses",
    clientProfile: "generic_openai",
    probeKind: "openai_responses",
    path: "responses",
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    }),
    body: (model) => ({
      model,
      input: [
        {
          role: "user",
          content: "Reply with exactly: OK",
        },
      ],
      max_output_tokens: 8,
      stream: true,
      store: false,
    }),
    completeEvent: "response.completed",
    failureEvents: ["response.failed", "response.incomplete", "error"],
    defaultModel: "gpt-5.4-mini",
  },
  {
    id: "claude_code_messages_stream_v1",
    routeCapability: "claude_code_messages",
    clientProfile: "claude_code",
    probeKind: "cli_real_request",
    path: "messages",
    headers: (apiKey) => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta":
        "claude-code-20250219,adaptive-thinking-2026-01-28,prompt-caching-scope-2026-01-05,effort-2025-11-24",
      "anthropic-dangerous-direct-browser-access": "true",
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Accept-Language": "*",
      "Sec-Fetch-Mode": "cors",
      "X-App": "cli",
      "User-Agent": "claude-cli/diagnostic-probe (external, cli)",
    }),
    body: (model) => ({
      model,
      max_tokens: 64,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Reply with exactly: OK" }],
        },
      ],
      system: [
        {
          type: "text",
          text: "AutoRouter diagnostic probe. Verify upstream protocol compatibility.",
        },
      ],
      tools: [],
      metadata: { user_id: "autorouter-diagnostic-probe" },
      temperature: 1,
      output_config: { type: "text" },
      stream: true,
    }),
    completeEvent: "message_stop",
    failureEvents: ["error"],
    defaultModel: "claude-sonnet-4-5-20250929",
  },
  {
    id: "anthropic_messages_stream_v1",
    routeCapability: "anthropic_messages",
    clientProfile: "generic_anthropic",
    probeKind: "anthropic_messages",
    path: "messages",
    headers: (apiKey) => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    }),
    body: (model) => ({
      model,
      max_tokens: 8,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      stream: true,
    }),
    completeEvent: "message_stop",
    failureEvents: ["error"],
    defaultModel: "claude-sonnet-4-5-20250929",
  },
];

function inferClientProfile(capability: RouteCapability): UpstreamProbeClientProfile {
  if (capability === "codex_cli_responses") return "codex_cli";
  if (capability === "claude_code_messages") return "claude_code";
  if (getProviderByRouteCapability(capability) === "anthropic") return "generic_anthropic";
  return "generic_openai";
}

function resolveProbeTemplate(
  routeCapability: RouteCapability,
  clientProfile: UpstreamProbeClientProfile
): ProbeTemplate | null {
  return (
    PROBE_TEMPLATES.find(
      (template) =>
        template.routeCapability === routeCapability && template.clientProfile === clientProfile
    ) ?? null
  );
}

function createRouterProbeIdentity(
  routeCapability: RouteCapability,
  clientProfile: UpstreamProbeClientProfile,
  reason: "route_unavailable" | "template_unavailable"
): ProbeResultIdentity {
  return {
    id: `${reason}_${routeCapability}_${clientProfile}_v1`,
    routeCapability,
    clientProfile,
    probeKind: "router",
  };
}

function selectRouteCapability(
  storedCapabilities: readonly string[] | null | undefined,
  requestedCapability?: RouteCapability
): RouteCapability | null {
  const normalized = normalizeRouteCapabilities(storedCapabilities);
  if (requestedCapability) {
    if (normalized.includes(requestedCapability)) return requestedCapability;
    const fallback = getFallbackRouteCapability(requestedCapability);
    return fallback && normalized.includes(fallback) ? requestedCapability : null;
  }
  return (
    normalized.find((capability) =>
      resolveProbeTemplate(capability, inferClientProfile(capability))
    ) ?? null
  );
}

function buildProbeUrl(baseUrl: string, path: string): string {
  const apiRoot = normalizeApiRoot(baseUrl);
  return new URL(path, `${apiRoot}/`).toString();
}

async function validateProbeUrl(probeUrl: string): Promise<string | null> {
  const safety = isUrlSafe(probeUrl);
  if (!safety.safe) return safety.reason ?? "Probe URL is not allowed";

  const hostname = new URL(probeUrl).hostname.toLowerCase();
  const isIpAddress = hostname.match(/^[\d.:]+$/);
  if (!isIpAddress && hostname !== "localhost") {
    const dnsCheck = await resolveAndValidateHostname(hostname);
    if (!dnsCheck.safe) return dnsCheck.reason ?? "Probe hostname is not allowed";
  }

  return null;
}

function classifyHttpFailure(
  statusCode: number
): Pick<ProbeExecutionResult, "status" | "layer" | "errorType"> {
  if (statusCode === 401 || statusCode === 403) {
    return { status: "auth_failed", layer: "auth", errorType: "authentication" };
  }
  if (statusCode === 429) {
    return { status: "rate_limited", layer: "business", errorType: "rate_limited" };
  }
  if (statusCode === 402) {
    return { status: "quota_exhausted", layer: "business", errorType: "quota_exhausted" };
  }
  if (statusCode === 404) {
    return { status: "model_unavailable", layer: "business", errorType: "model_unavailable" };
  }
  if (statusCode >= 500) {
    return { status: "upstream_error", layer: "transport", errorType: "upstream_error" };
  }
  return { status: "protocol_mismatch", layer: "protocol", errorType: "unexpected_status" };
}

function parseSseEvents(chunk: string): string[] {
  return chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith("event:"))
    .map((line) => line.slice("event:".length).trim())
    .filter(Boolean);
}

async function executeTemplateRequest(
  template: ProbeTemplate,
  probeUrl: string,
  apiKey: string,
  model: string,
  timeoutSeconds: number
): Promise<ProbeExecutionResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  const start = Date.now();
  let firstByteLatencyMs: number | null = null;

  try {
    const response = await fetch(probeUrl, {
      method: "POST",
      headers: template.headers(apiKey),
      body: JSON.stringify(template.body(model)),
      signal: controller.signal,
      redirect: "error",
    });

    firstByteLatencyMs = Date.now() - start;

    if (!response.ok) {
      const failure = classifyHttpFailure(response.status);
      const responseText = await response.text().catch(() => "");
      const responseBody = normalizeProbeResponseBody(responseText);
      return {
        status: failure.status,
        layer: failure.layer,
        success: false,
        latencyMs: firstByteLatencyMs,
        firstByteLatencyMs,
        completedLatencyMs: null,
        statusCode: response.status,
        errorType: failure.errorType,
        errorMessage: responseBody ? responseBody.slice(0, 500) : `HTTP ${response.status}`,
        responseBody,
      };
    }

    if (!response.body) {
      return {
        status: "protocol_mismatch",
        layer: "protocol",
        success: false,
        latencyMs: firstByteLatencyMs,
        firstByteLatencyMs,
        completedLatencyMs: null,
        statusCode: response.status,
        errorType: "missing_stream",
        errorMessage: "Probe response did not include a readable stream",
        responseBody: null,
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffered += decoder.decode(value, { stream: true });
      const events = parseSseEvents(buffered);
      if (events.some((event) => template.failureEvents.includes(event))) {
        const responseBody = normalizeProbeResponseBody(buffered);
        return {
          status: "business_failed",
          layer: "business",
          success: false,
          latencyMs: Date.now() - start,
          firstByteLatencyMs,
          completedLatencyMs: null,
          statusCode: response.status,
          errorType: "failure_event",
          errorMessage: `Probe stream returned failure event: ${events.find((event) => template.failureEvents.includes(event))}`,
          responseBody,
        };
      }
      if (events.includes(template.completeEvent)) {
        const completedLatencyMs = Date.now() - start;
        return {
          status: "ok",
          layer: "business",
          success: true,
          latencyMs: completedLatencyMs,
          firstByteLatencyMs,
          completedLatencyMs,
          statusCode: response.status,
          errorType: null,
          errorMessage: null,
          responseBody: normalizeProbeResponseBody(buffered),
        };
      }
    }

    return {
      status: "protocol_mismatch",
      layer: "protocol",
      success: false,
      latencyMs: Date.now() - start,
      firstByteLatencyMs,
      completedLatencyMs: null,
      statusCode: response.status,
      errorType: "stream_incomplete",
      errorMessage: `Probe stream ended before ${template.completeEvent}`,
      responseBody: normalizeProbeResponseBody(buffered),
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      status: aborted ? "transport_failed" : "transport_failed",
      layer: "transport",
      success: false,
      latencyMs: null,
      firstByteLatencyMs,
      completedLatencyMs: null,
      statusCode: null,
      errorType: aborted ? "timeout" : "network",
      errorMessage: aborted
        ? `Probe timed out after ${timeoutSeconds} seconds`
        : error instanceof Error
          ? error.message
          : String(error),
      responseBody: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function formatProbeResult(
  record: UpstreamProbeResult,
  upstreamName?: string
): UpstreamProbeResponse {
  return {
    id: record.id,
    upstream_id: record.upstreamId,
    upstream_name: upstreamName,
    route_capability: record.routeCapability,
    client_profile: record.clientProfile as UpstreamProbeClientProfile,
    probe_template_id: record.probeTemplateId,
    probe_kind: record.probeKind,
    status: record.status as UpstreamProbeStatus,
    layer: record.layer as UpstreamProbeLayer,
    success: record.success,
    latency_ms: record.latencyMs ?? null,
    first_byte_latency_ms: record.firstByteLatencyMs ?? null,
    completed_latency_ms: record.completedLatencyMs ?? null,
    status_code: record.statusCode ?? null,
    error_type: record.errorType ?? null,
    error_message: record.errorMessage ?? null,
    response_body: record.responseBody ?? null,
    probe_url: record.probeUrl ?? null,
    model: record.model ?? null,
    checked_at: record.checkedAt.toISOString(),
  };
}

async function persistProbeResult(
  upstreamId: string,
  identity: ProbeResultIdentity,
  probeUrl: string | null,
  model: string | null,
  result: ProbeExecutionResult
): Promise<UpstreamProbeResult> {
  const now = new Date();
  const existing = await db.query.upstreamProbeResults.findFirst({
    where: and(
      eq(upstreamProbeResults.upstreamId, upstreamId),
      eq(upstreamProbeResults.routeCapability, identity.routeCapability),
      eq(upstreamProbeResults.clientProfile, identity.clientProfile),
      eq(upstreamProbeResults.probeTemplateId, identity.id)
    ),
  });

  const values = {
    upstreamId,
    routeCapability: identity.routeCapability,
    clientProfile: identity.clientProfile,
    probeTemplateId: identity.id,
    probeKind: identity.probeKind,
    status: result.status,
    layer: result.layer,
    success: result.success,
    latencyMs: result.latencyMs,
    firstByteLatencyMs: result.firstByteLatencyMs,
    completedLatencyMs: result.completedLatencyMs,
    statusCode: result.statusCode,
    errorType: result.errorType,
    errorMessage: result.errorMessage,
    responseBody: result.responseBody,
    probeUrl,
    model,
    checkedAt: now,
    updatedAt: now,
  };

  if (existing) {
    const [updated] = await db
      .update(upstreamProbeResults)
      .set(values)
      .where(eq(upstreamProbeResults.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(upstreamProbeResults)
    .values({ ...values, createdAt: now })
    .returning();
  return created;
}

/**
 * Execute a protocol-aware diagnostic probe for an upstream.
 */
export async function executeUpstreamProbe(
  input: ExecuteUpstreamProbeInput
): Promise<UpstreamProbeResponse> {
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, input.upstreamId),
  });
  if (!upstream) {
    throw new UpstreamNotFoundError(`Upstream not found: ${input.upstreamId}`);
  }

  const routeCapability = selectRouteCapability(upstream.routeCapabilities, input.routeCapability);
  if (!routeCapability) {
    if (!input.routeCapability || !isRouteCapability(input.routeCapability)) {
      throw new Error("Requested route capability is not available for this upstream");
    }

    const clientProfile = input.clientProfile ?? inferClientProfile(input.routeCapability);
    const identity = createRouterProbeIdentity(
      input.routeCapability,
      clientProfile,
      "route_unavailable"
    );
    const record = await persistProbeResult(
      upstream.id,
      identity,
      null,
      input.model?.trim() || null,
      {
        status: "route_unavailable",
        layer: "router",
        success: false,
        latencyMs: null,
        firstByteLatencyMs: null,
        completedLatencyMs: null,
        statusCode: null,
        errorType: "route_capability_unavailable",
        errorMessage: "Requested route capability is not enabled for this upstream",
        responseBody: null,
      }
    );
    return formatProbeResult(record, upstream.name);
  }

  const clientProfile = input.clientProfile ?? inferClientProfile(routeCapability);
  const template = resolveProbeTemplate(routeCapability, clientProfile);
  if (!template) {
    const identity = createRouterProbeIdentity(
      routeCapability,
      clientProfile,
      "template_unavailable"
    );
    const record = await persistProbeResult(
      upstream.id,
      identity,
      null,
      input.model?.trim() || null,
      {
        status: "template_unavailable",
        layer: "router",
        success: false,
        latencyMs: null,
        firstByteLatencyMs: null,
        completedLatencyMs: null,
        statusCode: null,
        errorType: "probe_template_unavailable",
        errorMessage:
          "No probe template is available for the selected capability and client profile",
        responseBody: null,
      }
    );
    return formatProbeResult(record, upstream.name);
  }

  const probeUrl = buildProbeUrl(upstream.baseUrl, template.path);
  const model = input.model?.trim() || template.defaultModel;
  const invalidReason = await validateProbeUrl(probeUrl);
  const result: ProbeExecutionResult = invalidReason
    ? {
        status: "configuration_error",
        layer: "configuration",
        success: false,
        latencyMs: null,
        firstByteLatencyMs: null,
        completedLatencyMs: null,
        statusCode: null,
        errorType: "unsafe_url",
        errorMessage: invalidReason,
        responseBody: null,
      }
    : await executeTemplateRequest(
        template,
        probeUrl,
        getDecryptedApiKey(upstream),
        model,
        upstream.timeout ?? 10
      );

  const record = await persistProbeResult(upstream.id, template, probeUrl, model, result);
  return formatProbeResult(record, upstream.name);
}

/**
 * List latest persisted diagnostic probe results.
 */
export async function listUpstreamProbeResults(
  upstreamId?: string
): Promise<UpstreamProbeListResponse> {
  const baseQuery = db
    .select({ result: upstreamProbeResults, upstreamName: upstreams.name })
    .from(upstreamProbeResults)
    .innerJoin(upstreams, eq(upstreamProbeResults.upstreamId, upstreams.id));
  const rows = upstreamId
    ? await baseQuery
        .where(eq(upstreamProbeResults.upstreamId, upstreamId))
        .orderBy(desc(upstreamProbeResults.checkedAt))
    : await baseQuery.orderBy(desc(upstreamProbeResults.checkedAt));

  return {
    data: rows.map((row) => formatProbeResult(row.result, row.upstreamName)),
    total: rows.length,
  };
}
