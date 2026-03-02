import { describe, expect, it } from "vitest";
import { matchRouteCapability } from "@/lib/services/route-capability-matcher";

describe("matchRouteCapability", () => {
  it("should match anthropic message routes", () => {
    expect(matchRouteCapability("POST", "/v1/messages")).toBe("anthropic_messages");
    expect(matchRouteCapability("POST", "v1/messages/count_tokens")).toBe("anthropic_messages");
    expect(matchRouteCapability("POST", "messages")).toBe("anthropic_messages");
    expect(matchRouteCapability("POST", "messages/count_tokens")).toBe("anthropic_messages");
    expect(matchRouteCapability("POST", "messages/batches")).toBe("anthropic_messages");
  });

  it("should match codex responses route", () => {
    expect(matchRouteCapability("POST", "/v1/responses")).toBe("codex_responses");
    expect(matchRouteCapability("POST", "responses")).toBe("codex_responses");
    expect(matchRouteCapability("POST", "/v1/responses/compact")).toBe("codex_responses");
    expect(matchRouteCapability("POST", "responses/trace")).toBe("codex_responses");
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
