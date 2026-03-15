import { describe, expect, it } from "vitest";
import {
  extractGeminiModelFromPath,
  matchRouteCapability,
  resolveRouteCapability,
} from "@/lib/services/route-capability-matcher";

describe("matchRouteCapability", () => {
  it("should match anthropic message routes", () => {
    expect(matchRouteCapability("POST", "/v1/messages")).toBe("anthropic_messages");
    expect(matchRouteCapability("POST", "v1/messages/count_tokens")).toBe("anthropic_messages");
    expect(matchRouteCapability("POST", "messages")).toBe("anthropic_messages");
    expect(matchRouteCapability("POST", "messages/count_tokens")).toBe("anthropic_messages");
    expect(matchRouteCapability("POST", "messages/batches")).toBe("anthropic_messages");
  });

  it("should match generic openai responses route when no cli headers are present", () => {
    expect(matchRouteCapability("POST", "/v1/responses")).toBe("openai_responses");
    expect(matchRouteCapability("POST", "responses")).toBe("openai_responses");
    expect(matchRouteCapability("POST", "/v1/responses/compact")).toBe("openai_responses");
    expect(matchRouteCapability("POST", "responses/trace")).toBe("openai_responses");
  });

  it("should match codex cli responses when codex headers are present", () => {
    expect(matchRouteCapability("POST", "/v1/responses", { originator: "codex_cli_rs" })).toBe(
      "codex_cli_responses"
    );
    expect(
      matchRouteCapability("POST", "/v1/responses", { "user-agent": "codex_cli_rs/0.0.1" })
    ).toBe("codex_cli_responses");
    expect(matchRouteCapability("POST", "/v1/responses", { "x-codex-session": "sess-1" })).toBe(
      "codex_cli_responses"
    );
  });

  it("should match claude code messages when cli headers are present", () => {
    expect(
      matchRouteCapability("POST", "/v1/messages", {
        "anthropic-beta": "claude-code-20251001",
      })
    ).toBe("claude_code_messages");
    expect(
      matchRouteCapability("POST", "/v1/messages/count_tokens", {
        "user-agent": "claude-cli/1.0.0",
        "x-app": "cli",
      })
    ).toBe("claude_code_messages");
  });

  it("should expose path_header_profile route match source for cli-specific requests", () => {
    expect(resolveRouteCapability("POST", "/v1/responses", { originator: "codex_cli_rs" })).toEqual(
      {
        capability: "codex_cli_responses",
        routeMatchSource: "path_header_profile",
        protocolFamily: "responses",
      }
    );
  });

  it("should match openai chat compatible route", () => {
    expect(matchRouteCapability("POST", "/v1/chat/completions")).toBe("openai_chat_compatible");
    expect(matchRouteCapability("POST", "chat/completions")).toBe("openai_chat_compatible");
    expect(matchRouteCapability("POST", "/v1/chat/completions/stream")).toBe(
      "openai_chat_compatible"
    );
  });

  it("should match openai extended routes", () => {
    expect(matchRouteCapability("POST", "/v1/completions")).toBe("openai_extended");
    expect(matchRouteCapability("POST", "/v1/embeddings")).toBe("openai_extended");
    expect(matchRouteCapability("POST", "/v1/moderations")).toBe("openai_extended");
    expect(matchRouteCapability("POST", "/v1/images/generations")).toBe("openai_extended");
    expect(matchRouteCapability("POST", "/v1/images/edits")).toBe("openai_extended");
    expect(matchRouteCapability("POST", "completions")).toBe("openai_extended");
    expect(matchRouteCapability("POST", "images/edits")).toBe("openai_extended");
    expect(matchRouteCapability("POST", "/v1/completions/batch")).toBe("openai_extended");
    expect(matchRouteCapability("POST", "images/generations/async")).toBe("openai_extended");
  });

  it("should match gemini native routes", () => {
    expect(matchRouteCapability("POST", "/v1beta/models/gemini-2.5-pro:generateContent")).toBe(
      "gemini_native_generate"
    );
    expect(
      matchRouteCapability("POST", "/v1beta/models/gemini-2.5-flash:streamGenerateContent")
    ).toBe("gemini_native_generate");
  });

  it("should match gemini code assist internal routes", () => {
    expect(matchRouteCapability("POST", "/v1internal:generateContent")).toBe(
      "gemini_code_assist_internal"
    );
    expect(matchRouteCapability("POST", "/v1internal:streamGenerateContent")).toBe(
      "gemini_code_assist_internal"
    );
  });

  it("should return null for unsupported routes", () => {
    expect(matchRouteCapability("POST", "/v1/unknown")).toBeNull();
    expect(matchRouteCapability("POST", "/v1/responsesX")).toBeNull();
    expect(matchRouteCapability("POST", "/v1/messagesX")).toBeNull();
    expect(matchRouteCapability("POST", "/v1/chat/completionsX")).toBeNull();
    expect(matchRouteCapability("POST", "/v1/images/editsX")).toBeNull();
  });

  it("should return null for dot-segment paths to prevent capability bypass", () => {
    expect(matchRouteCapability("POST", "/v1/responses/../chat/completions")).toBeNull();
    expect(matchRouteCapability("POST", "/v1/responses/%2e%2e/chat/completions")).toBeNull();
    expect(matchRouteCapability("POST", "/v1/responses/%2E%2E/chat/completions")).toBeNull();
    expect(matchRouteCapability("POST", "/v1/responses/%2e%2e%2fchat/completions")).toBeNull();
    expect(matchRouteCapability("POST", "/v1/responses/%2e%2e%5cchat/completions")).toBeNull();
    expect(matchRouteCapability("POST", "/v1/messages/%2e/count_tokens")).toBeNull();
  });

  it("should return null when method is not POST", () => {
    expect(matchRouteCapability("GET", "/v1/responses")).toBeNull();
    expect(matchRouteCapability("GET", "/v1/responses/compact")).toBeNull();
    expect(matchRouteCapability("DELETE", "/v1/messages")).toBeNull();
  });
});

describe("extractGeminiModelFromPath", () => {
  it("should extract model from gemini native route path", () => {
    expect(extractGeminiModelFromPath("/v1beta/models/gemini-2.5-flash:generateContent")).toBe(
      "gemini-2.5-flash"
    );
    expect(
      extractGeminiModelFromPath("/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent")
    ).toBe("gemini-3.1-pro-preview");
  });

  it("should decode URL-encoded model segments", () => {
    expect(
      extractGeminiModelFromPath("/v1beta/models/gemini-2.5-flash%2Dlite:generateContent")
    ).toBe("gemini-2.5-flash-lite");
  });

  it("should return null for unsupported or unsafe paths", () => {
    expect(extractGeminiModelFromPath("/v1/chat/completions")).toBeNull();
    expect(extractGeminiModelFromPath("/v1beta/models/%2e%2e:generateContent")).toBeNull();
  });
});
