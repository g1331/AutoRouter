import { describe, expect, it, beforeEach } from "vitest";
import {
  redactHeaders,
  isRecorderEnabled,
  getFixtureRoot,
  buildFixturePath,
} from "@/lib/services/traffic-recorder";
import path from "path";

describe("traffic recorder", () => {
  beforeEach(() => {
    delete process.env.RECORDER_ENABLED;
    delete process.env.RECORDER_FIXTURES_DIR;
  });

  describe("redactHeaders", () => {
    it("redacts sensitive headers from Headers objects", () => {
      const headers = new Headers({
        Authorization: "Bearer secret",
        "x-api-key": "secret-key",
        Cookie: "session=token",
        "content-type": "application/json",
      });

      expect(redactHeaders(headers)).toEqual({
        authorization: "[REDACTED]",
        "x-api-key": "[REDACTED]",
        cookie: "[REDACTED]",
        "content-type": "application/json",
      });
    });

    it("redacts sensitive headers from plain objects", () => {
      expect(
        redactHeaders({
          authorization: "Bearer secret",
          "set-cookie": "token",
          accept: "application/json",
        })
      ).toEqual({
        authorization: "[REDACTED]",
        "set-cookie": "[REDACTED]",
        accept: "application/json",
      });
    });

    it("handles empty headers", () => {
      expect(redactHeaders({})).toEqual({});
      expect(redactHeaders(new Headers())).toEqual({});
    });

    it("is case-insensitive for header names", () => {
      expect(
        redactHeaders({
          AUTHORIZATION: "Bearer secret",
          "X-API-KEY": "secret-key",
          "Content-Type": "application/json",
        })
      ).toEqual({
        AUTHORIZATION: "[REDACTED]",
        "X-API-KEY": "[REDACTED]",
        "Content-Type": "application/json",
      });
    });
  });

  describe("isRecorderEnabled", () => {
    it("returns true when RECORDER_ENABLED is 'true'", () => {
      process.env.RECORDER_ENABLED = "true";
      expect(isRecorderEnabled()).toBe(true);
    });

    it("returns true when RECORDER_ENABLED is '1'", () => {
      process.env.RECORDER_ENABLED = "1";
      expect(isRecorderEnabled()).toBe(true);
    });

    it("returns false when RECORDER_ENABLED is not set", () => {
      expect(isRecorderEnabled()).toBe(false);
    });

    it("returns false when RECORDER_ENABLED is 'false'", () => {
      process.env.RECORDER_ENABLED = "false";
      expect(isRecorderEnabled()).toBe(false);
    });

    it("returns false when RECORDER_ENABLED is '0'", () => {
      process.env.RECORDER_ENABLED = "0";
      expect(isRecorderEnabled()).toBe(false);
    });

    it("returns false when RECORDER_ENABLED is any other value", () => {
      process.env.RECORDER_ENABLED = "yes";
      expect(isRecorderEnabled()).toBe(false);
    });
  });

  describe("getFixtureRoot", () => {
    it("returns custom directory when RECORDER_FIXTURES_DIR is set", () => {
      process.env.RECORDER_FIXTURES_DIR = "/custom/fixtures";
      expect(getFixtureRoot()).toBe("/custom/fixtures");
    });

    it("returns default directory when RECORDER_FIXTURES_DIR is not set", () => {
      expect(getFixtureRoot()).toBe("tests/fixtures");
    });

    it("returns default directory when RECORDER_FIXTURES_DIR is empty", () => {
      process.env.RECORDER_FIXTURES_DIR = "";
      expect(getFixtureRoot()).toBe("tests/fixtures");
    });
  });

  describe("buildFixturePath", () => {
    it("builds correct path with valid inputs", () => {
      const result = buildFixturePath("openai", "chat/completions", "2024-01-01T12-00-00");
      expect(result).toBe(path.join("tests/fixtures", "openai", "chat_completions", "2024-01-01T12-00-00.json"));
    });

    it("sanitizes special characters in provider and route", () => {
      const result = buildFixturePath("open@ai!", "chat/completions?v=1", "2024-01-01");
      expect(result).toBe(path.join("tests/fixtures", "open_ai_", "chat_completions_v_1", "2024-01-01.json"));
    });

    it("handles empty provider and route", () => {
      const result = buildFixturePath("", "", "2024-01-01");
      expect(result).toBe(path.join("tests/fixtures", "unknown", "unknown", "2024-01-01.json"));
    });

    it("sanitizes slashes in route", () => {
      const result = buildFixturePath("anthropic", "v1/messages", "2024-01-01");
      expect(result).toBe(path.join("tests/fixtures", "anthropic", "v1_messages", "2024-01-01.json"));
    });

    it("handles null provider and route", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = buildFixturePath(null as any, null as any, "2024-01-01");
      expect(result).toBe(path.join("tests/fixtures", "unknown", "unknown", "2024-01-01.json"));
    });

    it("preserves alphanumeric characters and common separators", () => {
      const result = buildFixturePath("provider-1.0", "route_v2.1", "2024-01-01");
      expect(result).toBe(path.join("tests/fixtures", "provider-1.0", "route_v2.1", "2024-01-01.json"));
    });

    it("handles multiple consecutive special characters", () => {
      const result = buildFixturePath("open@@@ai", "chat///completions", "2024-01-01");
      // The regex replaces consecutive special chars with a single underscore
      expect(result).toBe(path.join("tests/fixtures", "open_ai", "chat_completions", "2024-01-01.json"));
    });
  });
});
