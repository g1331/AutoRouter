import { describe, expect, it } from "vitest";
import {
  mergeCliproxyApiUpstreamConfig,
  parseCliproxyApiUpstreamConfig,
} from "@/lib/services/cliproxyapi-upstream-config";

describe("cliproxyapi-upstream-config", () => {
  it("parses valid upstream metadata from config JSON", () => {
    const result = parseCliproxyApiUpstreamConfig(
      JSON.stringify({
        cliproxyapi: {
          connection_id: "conn-1",
          provider: "codex",
          pool_mode: "account",
          account_prefix: "main",
        },
      })
    );

    expect(result).toEqual({
      connection_id: "conn-1",
      provider: "codex",
      pool_mode: "account",
      account_prefix: "main",
    });
  });

  it("returns null for invalid or absent metadata", () => {
    expect(parseCliproxyApiUpstreamConfig(null)).toBeNull();
    expect(parseCliproxyApiUpstreamConfig("not-json")).toBeNull();
    expect(parseCliproxyApiUpstreamConfig(JSON.stringify({ cliproxyapi: {} }))).toBeNull();
  });

  it("merges metadata while preserving unrelated config keys", () => {
    const result = mergeCliproxyApiUpstreamConfig(JSON.stringify({ custom: true }), {
      connection_id: "conn-1",
      provider: "claude",
      pool_mode: "pool",
      account_prefix: null,
    });

    expect(result ? JSON.parse(result) : null).toEqual({
      custom: true,
      cliproxyapi: {
        connection_id: "conn-1",
        provider: "claude",
        pool_mode: "pool",
        account_prefix: null,
      },
    });
  });

  it("removes metadata only when null is provided", () => {
    const current = JSON.stringify({
      custom: true,
      cliproxyapi: {
        connection_id: "conn-1",
        provider: "gemini",
        pool_mode: "pool",
        account_prefix: null,
      },
    });

    expect(mergeCliproxyApiUpstreamConfig(current, undefined)).toBe(current);
    expect(mergeCliproxyApiUpstreamConfig(current, null)).toBe(JSON.stringify({ custom: true }));
  });
});
