import { describe, it, expect } from "vitest";
import {
  createUnifiedErrorBody,
  createUnifiedErrorResponse,
  createSSEErrorEvent,
  getHttpStatusForError,
  type UnifiedErrorCode,
} from "@/lib/services/unified-error";

describe("Unified Error", () => {
  describe("createUnifiedErrorBody", () => {
    it("should create correct error body for ALL_UPSTREAMS_UNAVAILABLE", () => {
      const body = createUnifiedErrorBody("ALL_UPSTREAMS_UNAVAILABLE");
      expect(body).toEqual({
        error: {
          message: "服务暂时不可用，请稍后重试",
          type: "service_unavailable",
          code: "ALL_UPSTREAMS_UNAVAILABLE",
        },
      });
    });

    it("should create correct error body for NO_UPSTREAMS_CONFIGURED", () => {
      const body = createUnifiedErrorBody("NO_UPSTREAMS_CONFIGURED");
      expect(body).toEqual({
        error: {
          message: "服务暂时不可用，请稍后重试",
          type: "service_unavailable",
          code: "NO_UPSTREAMS_CONFIGURED",
        },
      });
    });

    it("should create correct error body for NO_AUTHORIZED_UPSTREAMS", () => {
      const body = createUnifiedErrorBody("NO_AUTHORIZED_UPSTREAMS");
      expect(body).toEqual({
        error: {
          message: "当前密钥未绑定可用上游，请先完成授权配置",
          type: "client_error",
          code: "NO_AUTHORIZED_UPSTREAMS",
        },
      });
    });

    it("should include optional diagnostic fields when provided", () => {
      const body = createUnifiedErrorBody("ALL_UPSTREAMS_UNAVAILABLE", {
        reason: "UPSTREAM_HTTP_ERROR",
        did_send_upstream: true,
        request_id: "abc123",
        user_hint: "hint",
      });
      expect(body.error).toEqual(
        expect.objectContaining({
          code: "ALL_UPSTREAMS_UNAVAILABLE",
          reason: "UPSTREAM_HTTP_ERROR",
          did_send_upstream: true,
          request_id: "abc123",
          user_hint: "hint",
        })
      );
    });

    it("should accept CLIENT_DISCONNECTED as a diagnostic reason", () => {
      const body = createUnifiedErrorBody("CLIENT_DISCONNECTED", {
        reason: "CLIENT_DISCONNECTED",
        did_send_upstream: true,
      });
      expect(body.error).toEqual(
        expect.objectContaining({
          code: "CLIENT_DISCONNECTED",
          reason: "CLIENT_DISCONNECTED",
          did_send_upstream: true,
        })
      );
    });

    it("should create correct error body for REQUEST_TIMEOUT", () => {
      const body = createUnifiedErrorBody("REQUEST_TIMEOUT");
      expect(body).toEqual({
        error: {
          message: "请求超时，请稍后重试",
          type: "timeout",
          code: "REQUEST_TIMEOUT",
        },
      });
    });

    it("should create correct error body for CLIENT_DISCONNECTED", () => {
      const body = createUnifiedErrorBody("CLIENT_DISCONNECTED");
      expect(body).toEqual({
        error: {
          message: "客户端已断开连接",
          type: "client_error",
          code: "CLIENT_DISCONNECTED",
        },
      });
    });

    it("should create correct error body for STREAM_ERROR", () => {
      const body = createUnifiedErrorBody("STREAM_ERROR");
      expect(body).toEqual({
        error: {
          message: "流式响应中断，请重试",
          type: "stream_error",
          code: "STREAM_ERROR",
        },
      });
    });
  });

  describe("createUnifiedErrorResponse", () => {
    it("should return 503 for ALL_UPSTREAMS_UNAVAILABLE", async () => {
      const response = createUnifiedErrorResponse("ALL_UPSTREAMS_UNAVAILABLE");
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error.code).toBe("ALL_UPSTREAMS_UNAVAILABLE");
    });

    it("should return 504 for REQUEST_TIMEOUT", async () => {
      const response = createUnifiedErrorResponse("REQUEST_TIMEOUT");
      expect(response.status).toBe(504);
    });

    it("should return 403 for NO_AUTHORIZED_UPSTREAMS", async () => {
      const response = createUnifiedErrorResponse("NO_AUTHORIZED_UPSTREAMS");
      expect(response.status).toBe(403);
    });

    it("should return 499 for CLIENT_DISCONNECTED", async () => {
      const response = createUnifiedErrorResponse("CLIENT_DISCONNECTED");
      expect(response.status).toBe(499);
    });

    it("should return 502 for STREAM_ERROR", async () => {
      const response = createUnifiedErrorResponse("STREAM_ERROR");
      expect(response.status).toBe(502);
    });
  });

  describe("createSSEErrorEvent", () => {
    it("should create valid SSE error event format", () => {
      const event = createSSEErrorEvent("ALL_UPSTREAMS_UNAVAILABLE");
      expect(event).toContain("event: error\n");
      expect(event).toContain("data: ");
      expect(event).toContain('"code":"ALL_UPSTREAMS_UNAVAILABLE"');
      expect(event.endsWith("\n\n")).toBe(true);
    });

    it("should contain valid JSON in data field", () => {
      const event = createSSEErrorEvent("STREAM_ERROR");
      const dataMatch = event.match(/data: (.+)\n\n/);
      expect(dataMatch).not.toBeNull();
      const data = JSON.parse(dataMatch![1]);
      expect(data.error.code).toBe("STREAM_ERROR");
    });
  });

  describe("getHttpStatusForError", () => {
    const testCases: Array<{ code: UnifiedErrorCode; expectedStatus: number }> = [
      { code: "ALL_UPSTREAMS_UNAVAILABLE", expectedStatus: 503 },
      { code: "NO_AUTHORIZED_UPSTREAMS", expectedStatus: 403 },
      { code: "NO_UPSTREAMS_CONFIGURED", expectedStatus: 503 },
      { code: "SERVICE_UNAVAILABLE", expectedStatus: 503 },
      { code: "REQUEST_TIMEOUT", expectedStatus: 504 },
      { code: "CLIENT_DISCONNECTED", expectedStatus: 499 },
      { code: "STREAM_ERROR", expectedStatus: 502 },
    ];

    testCases.forEach(({ code, expectedStatus }) => {
      it(`should return ${expectedStatus} for ${code}`, () => {
        expect(getHttpStatusForError(code)).toBe(expectedStatus);
      });
    });
  });
});
