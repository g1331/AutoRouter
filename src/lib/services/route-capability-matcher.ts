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

export function matchRouteCapability(method: string, path: string): RouteCapability | null {
  if (method.toUpperCase() !== "POST") {
    return null;
  }

  const normalizedPath = normalizeProxyPath(path);
  const withoutV1Prefix = removeV1Prefix(normalizedPath);

  if (withoutV1Prefix === "messages" || withoutV1Prefix === "messages/count_tokens") {
    return "anthropic_messages";
  }

  if (withoutV1Prefix === "responses") {
    return "codex_responses";
  }

  if (withoutV1Prefix === "chat/completions") {
    return "openai_chat_compatible";
  }

  if (OPENAI_EXTENDED_SUFFIX_PATHS.has(withoutV1Prefix)) {
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
