import { describe, expect, it } from "vitest";

import {
  extractRequestThinkingConfig,
  getRequestThinkingBadgeLabel,
} from "@/lib/utils/request-thinking-config";

describe("request-thinking-config", () => {
  it("extracts OpenAI Responses reasoning effort", () => {
    expect(
      extractRequestThinkingConfig("openai_responses", {
        model: "gpt-5.4",
        reasoning: {
          effort: "high",
        },
      })
    ).toEqual({
      provider: "openai",
      protocol: "openai_responses",
      mode: "reasoning",
      level: "high",
      budget_tokens: null,
      include_thoughts: null,
      source_paths: ["reasoning.effort"],
    });
  });

  it("extracts OpenAI Chat reasoning_effort", () => {
    expect(
      extractRequestThinkingConfig("openai_chat_compatible", {
        model: "gpt-5.4",
        reasoning_effort: "xhigh",
      })
    ).toEqual({
      provider: "openai",
      protocol: "openai_chat",
      mode: "reasoning",
      level: "xhigh",
      budget_tokens: null,
      include_thoughts: null,
      source_paths: ["reasoning_effort"],
    });
  });

  it("extracts Anthropic effort and thinking budget", () => {
    expect(
      extractRequestThinkingConfig("anthropic_messages", {
        model: "claude-sonnet",
        effort: "medium",
        thinking: {
          type: "enabled",
          budget_tokens: 8000,
        },
      })
    ).toEqual({
      provider: "anthropic",
      protocol: "anthropic_messages",
      mode: "manual",
      level: "medium",
      budget_tokens: 8000,
      include_thoughts: null,
      source_paths: ["effort", "thinking.type", "thinking.budget_tokens"],
    });
  });

  it("extracts Gemini thinking config fields", () => {
    expect(
      extractRequestThinkingConfig("gemini_native_generate", {
        generationConfig: {
          thinkingConfig: {
            thinkingLevel: "HIGH",
            thinkingBudget: 4096,
            includeThoughts: true,
          },
        },
      })
    ).toEqual({
      provider: "google",
      protocol: "gemini_generate",
      mode: "thinking",
      level: "HIGH",
      budget_tokens: 4096,
      include_thoughts: true,
      source_paths: [
        "generationConfig.thinkingConfig.thinkingLevel",
        "generationConfig.thinkingConfig.thinkingBudget",
        "generationConfig.thinkingConfig.includeThoughts",
      ],
    });
  });

  it("returns null for unsupported or missing payloads", () => {
    expect(extractRequestThinkingConfig("openai_chat_compatible", null)).toBeNull();
    expect(extractRequestThinkingConfig("openai_chat_compatible", { model: "gpt-5.4" })).toBeNull();
    expect(extractRequestThinkingConfig("openai_extended", { reasoning_effort: "high" })).toBeNull();
  });

  it("builds compact badge labels from normalized config", () => {
    expect(
      getRequestThinkingBadgeLabel({
        provider: "openai",
        protocol: "openai_chat",
        mode: "reasoning",
        level: "high",
        budget_tokens: null,
        include_thoughts: null,
        source_paths: ["reasoning_effort"],
      })
    ).toBe("high");

    expect(
      getRequestThinkingBadgeLabel({
        provider: "anthropic",
        protocol: "anthropic_messages",
        mode: "adaptive",
        level: null,
        budget_tokens: null,
        include_thoughts: null,
        source_paths: ["thinking.type"],
      })
    ).toBe("adaptive");

    expect(
      getRequestThinkingBadgeLabel({
        provider: "google",
        protocol: "gemini_generate",
        mode: "thinking",
        level: null,
        budget_tokens: 8192,
        include_thoughts: null,
        source_paths: ["generationConfig.thinkingConfig.thinkingBudget"],
      })
    ).toBe("budget:8,192");
  });
});
