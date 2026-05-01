import { describe, expect, it } from "vitest";
import {
  buildCliproxyApiAccountModelRules,
  buildCliproxyApiAccountUpstreamPreset,
  buildCliproxyApiUpstreamPresets,
} from "@/lib/services/cliproxyapi-presets";

describe("cliproxyapi-presets", () => {
  it("builds OAuth pool presets from a CPA /v1 base URL", () => {
    const presets = buildCliproxyApiUpstreamPresets("conn-1", "http://localhost:8317/v1");

    expect(presets).toEqual([
      expect.objectContaining({
        id: "codex",
        base_url: "http://localhost:8317/v1",
        route_capabilities: ["codex_cli_responses", "openai_responses"],
        model_discovery: expect.objectContaining({ mode: "openai_compatible" }),
        config: {
          connection_id: "conn-1",
          provider: "codex",
          pool_mode: "pool",
          account_prefix: null,
        },
      }),
      expect.objectContaining({
        id: "claude",
        base_url: "http://localhost:8317/api/provider/anthropic/v1",
        route_capabilities: ["claude_code_messages", "anthropic_messages"],
        model_discovery: expect.objectContaining({ mode: "anthropic_native" }),
      }),
      expect.objectContaining({
        id: "gemini",
        base_url: "http://localhost:8317/api/provider/google",
        route_capabilities: ["gemini_native_generate"],
        model_discovery: expect.objectContaining({ mode: "gemini_native" }),
      }),
    ]);
  });

  it("builds deduplicated exact model rules for fixed-account upstreams", () => {
    expect(buildCliproxyApiAccountModelRules("main", ["gpt-5-codex", "", "gpt-5-codex"])).toEqual([
      {
        type: "exact",
        value: "gpt-5-codex",
        target_model: "main/gpt-5-codex",
        source: "manual",
        display_label: "CLIProxyAPI account model",
      },
    ]);
  });

  it("builds fixed-account presets with CPA prefix rewrite targets", () => {
    const preset = buildCliproxyApiAccountUpstreamPreset({
      connectionId: "conn-1",
      connectionBaseUrl: "http://localhost:8317/v1",
      provider: "codex",
      accountName: "codex-main.json",
      accountPrefix: "main",
      models: ["gpt-5-codex"],
    });

    expect(preset).toEqual(
      expect.objectContaining({
        id: "codex",
        name: "CLIProxyAPI codex-main.json Account",
        config: {
          connection_id: "conn-1",
          provider: "codex",
          pool_mode: "account",
          account_prefix: "main",
        },
        model_rules: [
          {
            type: "exact",
            value: "gpt-5-codex",
            target_model: "main/gpt-5-codex",
            source: "manual",
            display_label: "CLIProxyAPI account model",
          },
        ],
      })
    );
  });
});
