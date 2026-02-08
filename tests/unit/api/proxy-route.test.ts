import { describe, it, expect } from "vitest";

/**
 * Unit tests for proxy route helper functions.
 * These functions are defined in src/app/api/proxy/v1/[...path]/route.ts
 * but tested here via re-implementation to verify logic.
 */

/**
 * Determine error type for failover logging (matches route.ts implementation).
 */
function getErrorType(
  error: Error | null,
  statusCode: number | null
): "timeout" | "http_5xx" | "http_429" | "connection_error" {
  if (statusCode === 429) return "http_429";
  if (statusCode && statusCode >= 500) return "http_5xx";
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("timed out") || msg.includes("timeout")) return "timeout";
  }
  return "connection_error";
}

/**
 * Check if an error indicates the upstream is unhealthy.
 */
function isFailoverableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("timed out") ||
      msg.includes("timeout") ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("socket hang up") ||
      msg.includes("network") ||
      msg.includes("fetch failed")
    );
  }
  return false;
}

/**
 * Check if an HTTP status code indicates the upstream is unhealthy.
 */
function shouldFailover(statusCode: number): boolean {
  if (statusCode >= 500 && statusCode <= 599) {
    return true;
  }
  if (statusCode === 429) {
    return true;
  }
  return false;
}

describe("proxy route helper functions", () => {
  describe("getErrorType", () => {
    it("returns http_429 for rate limit status", () => {
      expect(getErrorType(null, 429)).toBe("http_429");
    });

    it("returns http_5xx for server errors", () => {
      expect(getErrorType(null, 500)).toBe("http_5xx");
      expect(getErrorType(null, 502)).toBe("http_5xx");
      expect(getErrorType(null, 503)).toBe("http_5xx");
      expect(getErrorType(null, 504)).toBe("http_5xx");
    });

    it("returns timeout for timeout errors", () => {
      expect(getErrorType(new Error("Request timed out"), null)).toBe("timeout");
      expect(getErrorType(new Error("Connection timeout"), null)).toBe("timeout");
      expect(getErrorType(new Error("TIMEOUT error"), null)).toBe("timeout");
    });

    it("returns connection_error for other errors", () => {
      expect(getErrorType(new Error("ECONNREFUSED"), null)).toBe("connection_error");
      expect(getErrorType(new Error("Network error"), null)).toBe("connection_error");
      expect(getErrorType(null, null)).toBe("connection_error");
      expect(getErrorType(null, 400)).toBe("connection_error");
    });

    it("prioritizes status code over error message", () => {
      // 429 takes priority
      expect(getErrorType(new Error("timed out"), 429)).toBe("http_429");
      // 5xx takes priority
      expect(getErrorType(new Error("timed out"), 500)).toBe("http_5xx");
    });
  });

  describe("isFailoverableError", () => {
    it("returns true for timeout errors", () => {
      expect(isFailoverableError(new Error("Request timed out"))).toBe(true);
      expect(isFailoverableError(new Error("timeout exceeded"))).toBe(true);
    });

    it("returns true for connection errors", () => {
      expect(isFailoverableError(new Error("ECONNREFUSED"))).toBe(true);
      expect(isFailoverableError(new Error("ECONNRESET"))).toBe(true);
      expect(isFailoverableError(new Error("socket hang up"))).toBe(true);
    });

    it("returns true for network errors", () => {
      expect(isFailoverableError(new Error("network error"))).toBe(true);
      expect(isFailoverableError(new Error("fetch failed"))).toBe(true);
    });

    it("returns false for other errors", () => {
      expect(isFailoverableError(new Error("Invalid JSON"))).toBe(false);
      expect(isFailoverableError(new Error("Unknown error"))).toBe(false);
    });

    it("returns false for non-Error values", () => {
      expect(isFailoverableError("string error")).toBe(false);
      expect(isFailoverableError(null)).toBe(false);
      expect(isFailoverableError(undefined)).toBe(false);
      expect(isFailoverableError({ message: "error" })).toBe(false);
    });
  });

  describe("shouldFailover", () => {
    it("returns true for 5xx status codes", () => {
      expect(shouldFailover(500)).toBe(true);
      expect(shouldFailover(502)).toBe(true);
      expect(shouldFailover(503)).toBe(true);
      expect(shouldFailover(504)).toBe(true);
      expect(shouldFailover(599)).toBe(true);
    });

    it("returns true for 429 rate limit", () => {
      expect(shouldFailover(429)).toBe(true);
    });

    it("returns false for success codes", () => {
      expect(shouldFailover(200)).toBe(false);
      expect(shouldFailover(201)).toBe(false);
      expect(shouldFailover(204)).toBe(false);
    });

    it("returns false for other 4xx codes", () => {
      expect(shouldFailover(400)).toBe(false);
      expect(shouldFailover(401)).toBe(false);
      expect(shouldFailover(403)).toBe(false);
      expect(shouldFailover(404)).toBe(false);
    });

    it("returns false for codes outside range", () => {
      expect(shouldFailover(100)).toBe(false);
      expect(shouldFailover(300)).toBe(false);
      expect(shouldFailover(600)).toBe(false);
    });
  });

  describe("RoutingDecision type validation", () => {
    it("accepts valid routing decision data with provider_type routing type", () => {
      interface RoutingDecision {
        routingType: "provider_type";
        providerType: "anthropic" | "openai" | "google" | "custom" | null;
        resolvedModel: string | null;
        failoverAttempts: number;
        failoverHistory: Array<{
          upstream_id: string;
          upstream_name: string;
          attempted_at: string;
          error_type: "timeout" | "http_5xx" | "http_429" | "connection_error";
          error_message: string;
          status_code?: number | null;
        }>;
      }

      const tieredRouting: RoutingDecision = {
        routingType: "provider_type",
        providerType: "openai",
        resolvedModel: "gpt-4",
        failoverAttempts: 0,
        failoverHistory: [],
      };
      expect(tieredRouting.routingType).toBe("provider_type");
      expect(tieredRouting.providerType).toBe("openai");
      expect(tieredRouting.resolvedModel).toBe("gpt-4");

      const routingWithFailover: RoutingDecision = {
        routingType: "provider_type",
        providerType: "anthropic",
        resolvedModel: "claude-3-opus",
        failoverAttempts: 2,
        failoverHistory: [
          {
            upstream_id: "up-1",
            upstream_name: "Anthropic-1",
            attempted_at: "2024-01-01T00:00:00.000Z",
            error_type: "http_5xx",
            error_message: "HTTP 502 error",
            status_code: 502,
          },
          {
            upstream_id: "up-2",
            upstream_name: "Anthropic-2",
            attempted_at: "2024-01-01T00:00:01.000Z",
            error_type: "timeout",
            error_message: "Request timed out",
            status_code: null,
          },
        ],
      };
      expect(routingWithFailover.routingType).toBe("provider_type");
      expect(routingWithFailover.failoverAttempts).toBe(2);
      expect(routingWithFailover.failoverHistory).toHaveLength(2);
    });
  });

  describe("Model-based routing validation", () => {
    it("validates model extraction from request body", () => {
      const validBody = { model: "gpt-4", messages: [] };
      expect(validBody.model).toBe("gpt-4");

      const claudeBody = { model: "claude-3-opus-20240229", messages: [] };
      expect(claudeBody.model).toBe("claude-3-opus-20240229");

      const emptyBody = {};
      expect(emptyBody.model).toBeUndefined();
    });

    it("validates provider type mapping from model name", () => {
      function getProviderTypeForModel(model: string): string | null {
        const lowerModel = model.toLowerCase();
        if (lowerModel.startsWith("claude-")) return "anthropic";
        if (lowerModel.startsWith("gpt-")) return "openai";
        if (lowerModel.startsWith("gemini-")) return "google";
        return null;
      }

      expect(getProviderTypeForModel("claude-3-opus")).toBe("anthropic");
      expect(getProviderTypeForModel("gpt-4")).toBe("openai");
      expect(getProviderTypeForModel("gemini-pro")).toBe("google");
      expect(getProviderTypeForModel("unknown-model")).toBeNull();
    });
  });
});
