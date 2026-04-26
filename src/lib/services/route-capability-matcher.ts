import type { RouteCapability, RouteMatchSource } from "@/lib/route-capabilities";

const GEMINI_NATIVE_PATTERN = /^v1beta\/models\/([^/]+):(generateContent|streamGenerateContent)$/i;

const GEMINI_CODE_ASSIST_INTERNAL_PATHS = new Set([
  "v1internal:generateContent",
  "v1internal:streamGenerateContent",
]);

const V1_PREFIX = "v1/";

const OPENAI_EXTENDED_SUFFIX_PATHS = new Set([
  "completions",
  "embeddings",
  "moderations",
  "images/generations",
  "images/edits",
]);

type RouteProtocolFamily =
  | "messages"
  | "responses"
  | "openai_chat_compatible"
  | "openai_extended"
  | "gemini_native_generate"
  | "gemini_code_assist_internal";

type RouteMatchHeaders = Headers | Record<string, string | string[] | undefined>;

export interface RouteCapabilityMatchResult {
  capability: RouteCapability;
  routeMatchSource: RouteMatchSource;
  protocolFamily: RouteProtocolFamily;
}

export interface MatchedRouteCapabilityDetails {
  routeCapability: RouteCapability;
  routeMatchSource: RouteMatchSource;
  protocolFamily: RouteProtocolFamily;
}

function normalizeProxyPath(path: string): string {
  return path.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

function removeV1Prefix(path: string): string {
  return path.startsWith(V1_PREFIX) ? path.slice(V1_PREFIX.length) : path;
}

function containsTraversalToken(segment: string): boolean {
  return segment.split(/[\\/]+/).some((part) => part === "." || part === "..");
}

function hasDotSegments(path: string): boolean {
  const segments = path.split("/");

  for (const segment of segments) {
    if (containsTraversalToken(segment)) {
      return true;
    }

    if (segment.includes("%")) {
      try {
        const decoded = decodeURIComponent(segment);
        if (containsTraversalToken(decoded)) {
          return true;
        }
      } catch {
        return true;
      }
    }
  }

  return false;
}

function matchesPathFamily(path: string, familyRoot: string): boolean {
  return path === familyRoot || path.startsWith(`${familyRoot}/`);
}

function isOpenAIModelListNormalizedPath(path: string): boolean {
  return removeV1Prefix(path) === "models";
}

function extractGeminiModelFromNormalizedPath(path: string): string | null {
  const match = path.match(GEMINI_NATIVE_PATTERN);
  if (!match?.[1]) {
    return null;
  }

  const rawModel = match[1];

  try {
    const decodedModel = decodeURIComponent(rawModel);
    return containsTraversalToken(decodedModel) ? null : decodedModel;
  } catch {
    return containsTraversalToken(rawModel) ? null : rawModel;
  }
}

function getHeaderValue(
  headers: RouteMatchHeaders | undefined,
  headerName: string
): string | string[] | undefined {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    const value = headers.get(headerName);
    return value === null ? undefined : value;
  }

  const directValue = headers[headerName];
  if (directValue !== undefined) {
    return directValue;
  }

  const loweredHeaderName = headerName.toLowerCase();
  const matchedKey = Object.keys(headers).find((key) => key.toLowerCase() === loweredHeaderName);
  return matchedKey ? headers[matchedKey] : undefined;
}

function normalizeHeaderString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join(",").trim();
  }
  return typeof value === "string" ? value.trim() : "";
}

function hasHeaderPrefix(headers: RouteMatchHeaders | undefined, prefix: string): boolean {
  if (!headers) {
    return false;
  }

  const loweredPrefix = prefix.toLowerCase();
  if (headers instanceof Headers) {
    return Array.from(headers.keys()).some((key) => key.toLowerCase().startsWith(loweredPrefix));
  }

  return Object.keys(headers).some((key) => key.toLowerCase().startsWith(loweredPrefix));
}

function isCodexCliRequest(headers: RouteMatchHeaders | undefined): boolean {
  const originator = normalizeHeaderString(getHeaderValue(headers, "originator")).toLowerCase();
  if (originator === "codex_cli_rs") {
    return true;
  }

  const userAgent = normalizeHeaderString(getHeaderValue(headers, "user-agent")).toLowerCase();
  if (userAgent.startsWith("codex_cli_rs/")) {
    return true;
  }

  return hasHeaderPrefix(headers, "x-codex-");
}

function isClaudeCodeRequest(headers: RouteMatchHeaders | undefined): boolean {
  const anthropicBeta = normalizeHeaderString(
    getHeaderValue(headers, "anthropic-beta")
  ).toLowerCase();
  if (anthropicBeta.includes("claude-code-")) {
    return true;
  }

  const userAgent = normalizeHeaderString(getHeaderValue(headers, "user-agent")).toLowerCase();
  const xApp = normalizeHeaderString(getHeaderValue(headers, "x-app")).toLowerCase();
  return userAgent.startsWith("claude-cli/") && xApp === "cli";
}

function matchProtocolFamily(method: string, path: string): RouteProtocolFamily | null {
  const methodUpper = method.toUpperCase();
  const normalizedPath = normalizeProxyPath(path);
  if (hasDotSegments(normalizedPath)) {
    return null;
  }

  if (methodUpper === "GET" && isOpenAIModelListNormalizedPath(normalizedPath)) {
    return "openai_chat_compatible";
  }

  if (methodUpper !== "POST") {
    return null;
  }

  const withoutV1Prefix = removeV1Prefix(normalizedPath);
  if (matchesPathFamily(withoutV1Prefix, "messages")) {
    return "messages";
  }

  if (matchesPathFamily(withoutV1Prefix, "responses")) {
    return "responses";
  }

  if (matchesPathFamily(withoutV1Prefix, "chat/completions")) {
    return "openai_chat_compatible";
  }

  if (
    Array.from(OPENAI_EXTENDED_SUFFIX_PATHS).some((familyRoot) =>
      matchesPathFamily(withoutV1Prefix, familyRoot)
    )
  ) {
    return "openai_extended";
  }

  if (extractGeminiModelFromNormalizedPath(normalizedPath)) {
    return "gemini_native_generate";
  }

  if (GEMINI_CODE_ASSIST_INTERNAL_PATHS.has(normalizedPath)) {
    return "gemini_code_assist_internal";
  }

  return null;
}

function resolveFinalCapability(
  protocolFamily: RouteProtocolFamily,
  headers?: RouteMatchHeaders
): RouteCapabilityMatchResult {
  switch (protocolFamily) {
    case "messages":
      if (isClaudeCodeRequest(headers)) {
        return {
          capability: "claude_code_messages",
          routeMatchSource: "path_header_profile",
          protocolFamily,
        };
      }
      return {
        capability: "anthropic_messages",
        routeMatchSource: "path",
        protocolFamily,
      };
    case "responses":
      if (isCodexCliRequest(headers)) {
        return {
          capability: "codex_cli_responses",
          routeMatchSource: "path_header_profile",
          protocolFamily,
        };
      }
      return {
        capability: "openai_responses",
        routeMatchSource: "path",
        protocolFamily,
      };
    case "openai_chat_compatible":
      return {
        capability: "openai_chat_compatible",
        routeMatchSource: "path",
        protocolFamily,
      };
    case "openai_extended":
      return {
        capability: "openai_extended",
        routeMatchSource: "path",
        protocolFamily,
      };
    case "gemini_native_generate":
      return {
        capability: "gemini_native_generate",
        routeMatchSource: "path",
        protocolFamily,
      };
    case "gemini_code_assist_internal":
      return {
        capability: "gemini_code_assist_internal",
        routeMatchSource: "path",
        protocolFamily,
      };
  }
}

/**
 * Extract a Gemini model identifier from a normalized proxy path when possible.
 */
export function extractGeminiModelFromPath(path: string): string | null {
  const normalizedPath = normalizeProxyPath(path);
  if (hasDotSegments(normalizedPath)) {
    return null;
  }

  return extractGeminiModelFromNormalizedPath(normalizedPath);
}

/**
 * Match OpenAI-compatible model list requests that do not carry a request body model.
 */
export function isOpenAIModelListRequest(method: string, path: string): boolean {
  if (method.toUpperCase() !== "GET") {
    return false;
  }

  const normalizedPath = normalizeProxyPath(path);
  if (hasDotSegments(normalizedPath)) {
    return false;
  }

  return isOpenAIModelListNormalizedPath(normalizedPath);
}

/**
 * Resolve an incoming proxy request to a supported route capability with match metadata.
 */
export function resolveRouteCapability(
  method: string,
  path: string,
  headers?: RouteMatchHeaders
): RouteCapabilityMatchResult | null {
  const protocolFamily = matchProtocolFamily(method, path);
  if (!protocolFamily) {
    return null;
  }

  return resolveFinalCapability(protocolFamily, headers);
}

/**
 * Match an incoming proxy request to a supported route capability and return detailed match metadata.
 */
export function matchRouteCapabilityDetails(
  method: string,
  path: string,
  headers?: RouteMatchHeaders
): MatchedRouteCapabilityDetails | null {
  const result = resolveRouteCapability(method, path, headers);
  if (!result) {
    return null;
  }

  return {
    routeCapability: result.capability,
    routeMatchSource: result.routeMatchSource,
    protocolFamily: result.protocolFamily,
  };
}

/**
 * Match an incoming proxy request to a supported route capability.
 */
export function matchRouteCapability(
  method: string,
  path: string,
  headers?: RouteMatchHeaders
): RouteCapability | null {
  return resolveRouteCapability(method, path, headers)?.capability ?? null;
}
