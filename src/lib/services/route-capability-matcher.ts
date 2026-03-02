import type { RouteCapability } from "@/lib/route-capabilities";

const GEMINI_NATIVE_PATTERN = /^v1beta\/models\/[^/]+:(generateContent|streamGenerateContent)$/i;

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

export function matchRouteCapability(method: string, path: string): RouteCapability | null {
  if (method.toUpperCase() !== "POST") {
    return null;
  }

  const normalizedPath = normalizeProxyPath(path);
  if (hasDotSegments(normalizedPath)) {
    return null;
  }
  const withoutV1Prefix = removeV1Prefix(normalizedPath);

  if (matchesPathFamily(withoutV1Prefix, "messages")) {
    return "anthropic_messages";
  }

  if (matchesPathFamily(withoutV1Prefix, "responses")) {
    return "codex_responses";
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

  if (GEMINI_NATIVE_PATTERN.test(normalizedPath)) {
    return "gemini_native_generate";
  }

  if (GEMINI_CODE_ASSIST_INTERNAL_PATHS.has(normalizedPath)) {
    return "gemini_code_assist_internal";
  }

  return null;
}
