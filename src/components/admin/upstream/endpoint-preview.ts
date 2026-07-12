import type { RouteCapability } from "@/types/api";

/**
 * Endpoint preview helper shared by the upstream create dialog and the detail
 * page route/endpoint section, so create and edit surfaces normalize/preview
 * the base URL identically.
 */

export interface EndpointPreviewState {
  normalizedBaseUrl: string;
  previewUrl: string;
  previewPath: string;
  duplicateV1Warning: boolean;
  autoAppendV1Applied: boolean;
}

const V1_AUTO_APPEND_CAPABILITIES = new Set<RouteCapability>([
  "openai_responses",
  "codex_cli_responses",
  "anthropic_messages",
  "claude_code_messages",
  "openai_chat_compatible",
  "openai_extended",
]);

const CAPABILITY_PREVIEW_PATHS: Record<RouteCapability, string> = {
  openai_responses: "responses",
  codex_cli_responses: "responses",
  anthropic_messages: "messages",
  claude_code_messages: "messages",
  openai_chat_compatible: "chat/completions",
  openai_extended: "completions",
  gemini_native_generate: "v1beta/models/{model}:generateContent",
  gemini_code_assist_internal: "v1internal:generateContent",
};

function shouldAutoAppendV1(routeCapabilities: RouteCapability[] | null | undefined): boolean {
  return (routeCapabilities ?? []).some((capability) =>
    V1_AUTO_APPEND_CAPABILITIES.has(capability)
  );
}

function getPreviewPath(routeCapabilities: RouteCapability[] | null | undefined): string {
  const firstCapability = (routeCapabilities ?? [])[0];
  if (!firstCapability) {
    return CAPABILITY_PREVIEW_PATHS.openai_chat_compatible;
  }
  return (
    CAPABILITY_PREVIEW_PATHS[firstCapability] ?? CAPABILITY_PREVIEW_PATHS.openai_chat_compatible
  );
}

export function resolveEndpointPreview(
  rawBaseUrl: string,
  routeCapabilities: RouteCapability[] | null | undefined
): EndpointPreviewState | null {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const autoAppendV1 = shouldAutoAppendV1(routeCapabilities);
    const normalizedPathname = url.pathname.replace(/\/+$/, "") || "/";
    const manualV1Present = normalizedPathname.toLowerCase().endsWith("/v1");

    let finalPathname = normalizedPathname;
    let autoAppendV1Applied = false;
    if (autoAppendV1 && !manualV1Present) {
      finalPathname = `${normalizedPathname === "/" ? "" : normalizedPathname}/v1`;
      autoAppendV1Applied = true;
    }

    url.pathname = finalPathname || "/";
    const normalizedBaseUrl = url.toString().replace(/\/$/, "");
    const previewPath = getPreviewPath(routeCapabilities);
    const previewUrl = `${normalizedBaseUrl}/${previewPath.replace(/^\//, "")}`;

    return {
      normalizedBaseUrl,
      previewUrl,
      previewPath,
      duplicateV1Warning: autoAppendV1 && manualV1Present,
      autoAppendV1Applied,
    };
  } catch {
    return null;
  }
}
