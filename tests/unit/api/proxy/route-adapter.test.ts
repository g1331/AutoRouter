import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { executeProxyRequest } = vi.hoisted(() => ({
  executeProxyRequest: vi.fn(async (request: Request, path: string) =>
    Response.json({ method: request.method, path })
  ),
}));

vi.mock("@/app/api/proxy/v1/[...path]/proxy-request-lifecycle", () => ({
  executeProxyRequest,
}));

const route = await import("@/app/api/proxy/v1/[...path]/route");

describe("proxy HTTP adapter", () => {
  it.each([
    ["GET", route.GET],
    ["POST", route.POST],
    ["PUT", route.PUT],
    ["DELETE", route.DELETE],
    ["PATCH", route.PATCH],
  ])("delegates %s through the shared request lifecycle", async (method, handler) => {
    executeProxyRequest.mockClear();
    const request = new NextRequest("http://localhost/api/proxy/v1/chat/completions", {
      method,
    });

    const response = await handler(request, {
      params: Promise.resolve({ path: ["chat", "completions"] }),
    });

    expect(response.status).toBe(200);
    expect(executeProxyRequest).toHaveBeenCalledTimes(1);
    expect(executeProxyRequest).toHaveBeenCalledWith(request, "chat/completions");
  });
});
