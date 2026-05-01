import type {
  CliproxyApiProvider,
  CliproxyApiUpstreamConfig,
  CliproxyApiUpstreamPreset,
  RouteCapability,
  UpstreamModelDiscoveryConfig,
  UpstreamModelRule,
} from "@/types/api";

interface CliproxyApiPresetDefinition {
  id: CliproxyApiProvider;
  name: string;
  path: string;
  routeCapabilities: RouteCapability[];
  modelDiscovery: UpstreamModelDiscoveryConfig;
}

const CPA_PRESET_DEFINITIONS: readonly CliproxyApiPresetDefinition[] = [
  {
    id: "codex",
    name: "CLIProxyAPI Codex OAuth Pool",
    path: "/v1",
    routeCapabilities: ["codex_cli_responses", "openai_responses"],
    modelDiscovery: {
      mode: "openai_compatible",
      custom_endpoint: null,
      enable_lite_llm_fallback: false,
      auto_refresh_enabled: false,
    },
  },
  {
    id: "claude",
    name: "CLIProxyAPI Claude OAuth Pool",
    path: "/api/provider/anthropic/v1",
    routeCapabilities: ["claude_code_messages", "anthropic_messages"],
    modelDiscovery: {
      mode: "anthropic_native",
      custom_endpoint: null,
      enable_lite_llm_fallback: false,
      auto_refresh_enabled: false,
    },
  },
  {
    id: "gemini",
    name: "CLIProxyAPI Gemini OAuth Pool",
    path: "/api/provider/google",
    routeCapabilities: ["gemini_native_generate"],
    modelDiscovery: {
      mode: "gemini_native",
      custom_endpoint: null,
      enable_lite_llm_fallback: false,
      auto_refresh_enabled: false,
    },
  },
] as const;

function getCliproxyApiRoot(baseUrl: string): string {
  const url = new URL(baseUrl);
  const pathname = url.pathname.replace(/\/+$/, "");
  if (pathname === "/v1") {
    url.pathname = "/";
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function appendPresetPath(root: string, path: string): string {
  return `${root}/${path.replace(/^\/+/, "")}`;
}

function buildConfig(
  connectionId: string,
  provider: CliproxyApiProvider,
  poolMode: CliproxyApiUpstreamConfig["pool_mode"],
  accountPrefix: string | null
): CliproxyApiUpstreamConfig {
  return {
    connection_id: connectionId,
    provider,
    pool_mode: poolMode,
    account_prefix: accountPrefix,
  };
}

/**
 * Build OAuth pool upstream presets from a saved CLIProxyAPI connection base URL.
 */
export function buildCliproxyApiUpstreamPresets(
  connectionId: string,
  connectionBaseUrl: string
): CliproxyApiUpstreamPreset[] {
  const root = getCliproxyApiRoot(connectionBaseUrl);
  return CPA_PRESET_DEFINITIONS.map((definition) => ({
    id: definition.id,
    name: definition.name,
    base_url: appendPresetPath(root, definition.path),
    route_capabilities: definition.routeCapabilities,
    model_discovery: definition.modelDiscovery,
    config: buildConfig(connectionId, definition.id, "pool", null),
  }));
}

function prefixedModelName(accountPrefix: string, model: string): string {
  return `${accountPrefix.replace(/^\/+|\/+$/g, "")}/${model}`;
}

/**
 * Build initial model rules that constrain a fixed-account upstream to known account models.
 */
export function buildCliproxyApiAccountModelRules(
  accountPrefix: string | null,
  models: readonly string[]
): UpstreamModelRule[] {
  return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean))).map((model) => ({
    type: "exact",
    value: model,
    // CPA selects a prefixed account by receiving `prefix/model`, then strips the prefix upstream.
    target_model: accountPrefix ? prefixedModelName(accountPrefix, model) : null,
    source: "manual",
    display_label: "CLIProxyAPI account model",
  }));
}

/**
 * Build an account-scoped upstream preset.
 */
export function buildCliproxyApiAccountUpstreamPreset(input: {
  connectionId: string;
  connectionBaseUrl: string;
  provider: CliproxyApiProvider;
  accountName: string;
  accountPrefix: string | null;
  models: readonly string[];
}): CliproxyApiUpstreamPreset & { model_rules: UpstreamModelRule[] } {
  const poolPreset = buildCliproxyApiUpstreamPresets(
    input.connectionId,
    input.connectionBaseUrl
  ).find((preset) => preset.id === input.provider);
  if (!poolPreset) {
    throw new Error(`Unsupported CLIProxyAPI provider: ${input.provider}`);
  }

  return {
    ...poolPreset,
    name: `CLIProxyAPI ${input.accountName} Account`,
    config: buildConfig(input.connectionId, input.provider, "account", input.accountPrefix),
    model_rules: buildCliproxyApiAccountModelRules(input.accountPrefix, input.models),
  };
}
