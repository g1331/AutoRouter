import type { RouteCapability } from "@/lib/route-capabilities";

const OPENAI_EXTENDED_PATHS = new Set([
  "v1/completions",
  "v1/embeddings",
  "v1/moderations",
  "v1/images/generations",
  "v1/images/edits",
]);

const GEMINI_NATIVE_PATTERN = /^v1beta\/models\/[^/]+:(generateContent|streamGenerateContent)$/i;

const GEMINI_CODE_ASSIST_INTERNAL_PATHS = new Set([
  "v1internal:generateContent",
  "v1internal:streamGenerateContent",
]);

function normalizeProxyPath(path: string): string {
  return path.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

export function matchRouteCapability(method: string, path: string): RouteCapability | null {
  if (method.toUpperCase() !== "POST") {
    return null;
  }

  const normalizedPath = normalizeProxyPath(path);

  if (normalizedPath === "v1/messages" || normalizedPath === "v1/messages/count_tokens") {
    return "anthropic_messages";
  }

  if (normalizedPath === "v1/responses") {
    return "codex_responses";
  }

  if (normalizedPath === "v1/chat/completions") {
    return "openai_chat_compatible";
  }

  if (OPENAI_EXTENDED_PATHS.has(normalizedPath)) {
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
