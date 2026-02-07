import { describe, expect, it, beforeEach } from "vitest";
import {
  redactHeaders,
  redactUrl,
  compactSSEChunks,
  buildFixture,
  readStreamChunks,
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
        "Proxy-Authorization": "Basic secret",
        "content-type": "application/json",
      });

      expect(redactHeaders(headers)).toEqual({
        authorization: "[REDACTED]",
        "x-api-key": "[REDACTED]",
        cookie: "[REDACTED]",
        "proxy-authorization": "[REDACTED]",
        "content-type": "application/json",
      });
    });

    it("redacts sensitive headers from plain objects", () => {
      expect(
        redactHeaders({
          authorization: "Bearer secret",
          "set-cookie": "token",
          "x-forwarded-authorization": "Bearer forwarded",
          accept: "application/json",
        })
      ).toEqual({
        authorization: "[REDACTED]",
        "set-cookie": "[REDACTED]",
        "x-forwarded-authorization": "[REDACTED]",
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
    it("redacts PII headers (session_id, x-codex-turn-metadata, x-codex-beta-features)", () => {
      expect(
        redactHeaders({
          session_id: "019c37c9-12b8-7f41-972b-0ae2dd9c2c0b",
          "x-codex-turn-metadata": '{"workspaces":{"D:\\\\Codebase":{...}}}',
          "x-codex-beta-features": "shell_snapshot,collab",
          "content-type": "application/json",
        })
      ).toEqual({
        session_id: "[REDACTED]",
        "x-codex-turn-metadata": "[REDACTED]",
        "x-codex-beta-features": "[REDACTED]",
        "content-type": "application/json",
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
      expect(result).toBe(
        path.join("tests/fixtures", "openai", "chat_completions", "2024-01-01T12-00-00.json")
      );
    });

    it("sanitizes special characters in provider and route", () => {
      const result = buildFixturePath("open@ai!", "chat/completions?v=1", "2024-01-01");
      expect(result).toBe(
        path.join("tests/fixtures", "open_ai_", "chat_completions_v_1", "2024-01-01.json")
      );
    });

    it("handles empty provider and route", () => {
      const result = buildFixturePath("", "", "2024-01-01");
      expect(result).toBe(path.join("tests/fixtures", "unknown", "unknown", "2024-01-01.json"));
    });

    it("sanitizes slashes in route", () => {
      const result = buildFixturePath("anthropic", "v1/messages", "2024-01-01");
      expect(result).toBe(
        path.join("tests/fixtures", "anthropic", "v1_messages", "2024-01-01.json")
      );
    });

    it("handles null provider and route", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = buildFixturePath(null as any, null as any, "2024-01-01");
      expect(result).toBe(path.join("tests/fixtures", "unknown", "unknown", "2024-01-01.json"));
    });

    it("preserves alphanumeric characters and common separators", () => {
      const result = buildFixturePath("provider-1.0", "route_v2.1", "2024-01-01");
      expect(result).toBe(
        path.join("tests/fixtures", "provider-1.0", "route_v2.1", "2024-01-01.json")
      );
    });

    it("handles multiple consecutive special characters", () => {
      const result = buildFixturePath("open@@@ai", "chat///completions", "2024-01-01");
      // The regex replaces consecutive special chars with a single underscore
      expect(result).toBe(
        path.join("tests/fixtures", "open_ai", "chat_completions", "2024-01-01.json")
      );
    });
  });

  describe("redactUrl", () => {
    it("redacts host but preserves path", () => {
      expect(redactUrl("https://api.openai.com/v1")).toBe("[REDACTED]/v1");
    });

    it("preserves deeper paths", () => {
      expect(redactUrl("https://www.right.codes/codex/v1")).toBe("[REDACTED]/codex/v1");
    });

    it("handles URL with trailing slash", () => {
      expect(redactUrl("https://api.example.com/")).toBe("[REDACTED]/");
    });

    it("handles URL without path", () => {
      expect(redactUrl("https://api.example.com")).toBe("[REDACTED]/");
    });

    it("returns [REDACTED] for invalid URL", () => {
      expect(redactUrl("not-a-url")).toBe("[REDACTED]");
    });
  });

  describe("compactSSEChunks", () => {
    it("strips instructions and tools from response.created events", () => {
      const chunk =
        'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_1","instructions":"long system prompt","tools":[{"type":"function","name":"bash"}]}}\n\n';
      const result = compactSSEChunks([chunk]);
      expect(result).toHaveLength(1);
      const data = JSON.parse(result[0].split("data: ")[1].split("\n")[0]);
      expect(data.response.instructions).toBe("[STRIPPED:see_inbound_body]");
      expect(data.response.tools).toBe("[STRIPPED:see_inbound_body]");
      expect(data.response.id).toBe("resp_1");
    });

    it("strips from response.in_progress and response.completed too", () => {
      const chunks = [
        'event: response.in_progress\ndata: {"type":"response.in_progress","response":{"instructions":"x","tools":[]}}\n\n',
        'event: response.completed\ndata: {"type":"response.completed","response":{"instructions":"x","tools":[],"usage":{"total":100}}}\n\n',
      ];
      const result = compactSSEChunks(chunks);
      for (const r of result) {
        const data = JSON.parse(r.split("data: ")[1].split("\n")[0]);
        expect(data.response.instructions).toBe("[STRIPPED:see_inbound_body]");
        expect(data.response.tools).toBe("[STRIPPED:see_inbound_body]");
      }
      // Verify other fields preserved
      const completed = JSON.parse(result[1].split("data: ")[1].split("\n")[0]);
      expect(completed.response.usage.total).toBe(100);
    });

    it("leaves delta events untouched", () => {
      const chunk =
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hello"}\n\n';
      const result = compactSSEChunks([chunk]);
      expect(result[0]).toBe(chunk);
    });

    it("handles chunks with no event line gracefully", () => {
      const chunk = 'data: {"type":"unknown"}\n\n';
      const result = compactSSEChunks([chunk]);
      expect(result[0]).toBe(chunk);
    });

    it("handles malformed JSON gracefully", () => {
      const chunk = "event: response.created\ndata: {invalid json}\n\n";
      const result = compactSSEChunks([chunk]);
      expect(result[0]).toBe(chunk);
    });

    it("preserves trailing newlines", () => {
      const chunk = 'event: response.output_text.delta\ndata: {"delta":"hi"}\n\n';
      const result = compactSSEChunks([chunk]);
      expect(result[0]).toMatch(/\n\n$/);
    });
  });

  describe("buildFixture", () => {
    const baseParams = {
      requestId: "test-123",
      startTime: Date.now() - 100,
      provider: "openai",
      route: "responses",
      model: "gpt-4",
      inboundRequest: {
        method: "POST",
        path: "responses",
        headers: new Headers({
          authorization: "Bearer sk-test",
          "content-type": "application/json",
        }),
        bodyText: '{"model":"gpt-4","instructions":"hello"}',
        bodyJson: { model: "gpt-4", instructions: "hello" },
      },
      upstream: {
        id: "upstream-1",
        name: "openai-primary",
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
      },
      outboundHeaders: new Headers({
        authorization: "Bearer sk-upstream",
        "content-type": "application/json",
      }),
      response: {
        statusCode: 200,
        headers: new Headers({
          "content-type": "text/event-stream",
          "cf-ray": "abc123",
          server: "cloudflare",
        }),
        bodyText: null,
        bodyJson: null,
        streamChunks: [
          'event: response.created\ndata: {"type":"response.created","response":{"id":"r1","instructions":"hello","tools":[]}}\n\n',
          'event: response.output_text.delta\ndata: {"delta":"hi"}\n\n',
        ],
      },
    };

    it("sets meta.version to 2", () => {
      const fixture = buildFixture(baseParams);
      expect(fixture.meta.version).toBe(2);
    });

    it("stores only bodyJson when JSON parse succeeded", () => {
      const fixture = buildFixture(baseParams);
      expect(fixture.inbound.bodyJson).toEqual({ model: "gpt-4", instructions: "hello" });
      expect(fixture.inbound.bodyText).toBeUndefined();
    });

    it("stores only bodyText when bodyJson is null", () => {
      const fixture = buildFixture({
        ...baseParams,
        inboundRequest: {
          ...baseParams.inboundRequest,
          bodyJson: null,
          bodyText: "raw text body",
        },
      });
      expect(fixture.inbound.bodyText).toBe("raw text body");
      expect(fixture.inbound.bodyJson).toBeUndefined();
    });

    it("omits outbound.request body and sets bodyFromInbound", () => {
      const fixture = buildFixture(baseParams);
      expect(fixture.outbound.request.bodyFromInbound).toBe(true);
      expect(fixture.outbound.request.bodyText).toBeUndefined();
      expect(fixture.outbound.request.bodyJson).toBeUndefined();
    });

    it("redacts upstream baseUrl host but preserves path", () => {
      const fixture = buildFixture(baseParams);
      expect(fixture.outbound.upstream.baseUrl).toBe("[REDACTED]/v1");
    });

    it("preserves all response headers (only redacts sensitive ones)", () => {
      const fixture = buildFixture(baseParams);
      expect(fixture.outbound.response.headers["content-type"]).toBe("text/event-stream");
      expect(fixture.outbound.response.headers["cf-ray"]).toBe("abc123");
      expect(fixture.outbound.response.headers["server"]).toBe("cloudflare");
    });

    it("compacts stream chunks", () => {
      const fixture = buildFixture(baseParams);
      const chunks = fixture.outbound.response.streamChunks!;
      expect(chunks).toHaveLength(2);
      // First chunk (response.created) should have stripped fields
      const data = JSON.parse(chunks[0].split("data: ")[1].split("\n")[0]);
      expect(data.response.instructions).toBe("[STRIPPED:see_inbound_body]");
      expect(data.response.tools).toBe("[STRIPPED:see_inbound_body]");
      // Second chunk (delta) should be untouched
      expect(chunks[1]).toContain('"delta":"hi"');
    });

    it("redacts authorization in both inbound and outbound headers", () => {
      const fixture = buildFixture(baseParams);
      expect(fixture.inbound.headers["authorization"]).toBe("[REDACTED]");
      expect(fixture.outbound.request.headers["authorization"]).toBe("[REDACTED]");
    });
  });

  describe("readStreamChunks", () => {
    function makeStream(data: string): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(data));
          controller.close();
        },
      });
    }

    function makeMultiChunkStream(parts: string[]): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      let i = 0;
      return new ReadableStream({
        pull(controller) {
          if (i < parts.length) {
            controller.enqueue(encoder.encode(parts[i]));
            i++;
          } else {
            controller.close();
          }
        },
      });
    }

    it("splits by SSE event boundary when one TCP frame has multiple events", async () => {
      const combined = "event: a\ndata: {}\n\nevent: b\ndata: {}\n\n";
      const stream = makeStream(combined);
      const chunks = await readStreamChunks(stream);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toContain("event: a");
      expect(chunks[1]).toContain("event: b");
    });

    it("reassembles events split across TCP frames", async () => {
      // One SSE event split across two TCP reads
      const stream = makeMultiChunkStream(["event: response.created\nda", "ta: {}\n\n"]);
      const chunks = await readStreamChunks(stream);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain("event: response.created");
      expect(chunks[0]).toContain("data: {}");
    });

    it("each chunk ends with \\n\\n", async () => {
      const stream = makeStream("event: a\ndata: {}\n\nevent: b\ndata: {}\n\n");
      const chunks = await readStreamChunks(stream);
      for (const chunk of chunks) {
        expect(chunk).toMatch(/\n\n$/);
      }
    });

    it("handles empty stream", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const chunks = await readStreamChunks(stream);
      expect(chunks).toHaveLength(0);
    });

    it("handles stream with trailing data without \\n\\n", async () => {
      const stream = makeStream("event: a\ndata: {}");
      const chunks = await readStreamChunks(stream);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatch(/\n\n$/);
    });

    it("cancels stream when exceeding MAX_RECORDING_BYTES", async () => {
      // Create a stream that produces chunks exceeding 16 MiB
      const bigChunk = "x".repeat(1024 * 1024); // 1 MiB per chunk
      let cancelled = false;
      let index = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (index < 20) {
            // 20 MiB total > 16 MiB limit
            controller.enqueue(new TextEncoder().encode(bigChunk));
            index++;
          } else {
            controller.close();
          }
        },
        cancel() {
          cancelled = true;
        },
      });

      const chunks = await readStreamChunks(stream);
      expect(chunks[chunks.length - 1]).toBe("[RECORDING_TRUNCATED]");
      expect(cancelled).toBe(true);
    });
  });
});
