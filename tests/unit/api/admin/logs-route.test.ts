import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { listRequestLogsMock } = vi.hoisted(() => ({
  listRequestLogsMock: vi.fn(),
}));

// Mock admin authorization: the route now calls requireAdmin (the role-aware
// guard) instead of validateAdminAuth. importActual keeps errorResponse and
// getPaginationParams real so response shapes are unchanged; only the gate
// decision is driven by the request token.
vi.mock("@/lib/utils/api-auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/api-auth")>();
  return {
    ...actual,
    requireAdmin: vi.fn(async (request: Request) => {
      const authHeader = request.headers.get("authorization");
      if (authHeader === "Bearer valid-token") {
        return { kind: "admin_token" };
      }
      return actual.errorResponse("Unauthorized", 401);
    }),
  };
});

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@/lib/services/request-logger", () => ({
  listRequestLogs: (...args: unknown[]) => listRequestLogsMock(...args),
}));

vi.mock("@/lib/utils/api-transformers", () => ({
  transformPaginatedRequestLogs: (input: unknown) => input,
}));

const AUTH_HEADER = "Bearer valid-token";

describe("admin logs route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards the id query parameter into list filters", async () => {
    const { GET } = await import("@/app/api/admin/logs/route");
    listRequestLogsMock.mockResolvedValueOnce({
      items: [{ id: "log-1" }],
      total: 1,
      page: 1,
      pageSize: 1,
      totalPages: 1,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/admin/logs?id=log-1&page_size=1", {
        headers: { authorization: AUTH_HEADER },
      })
    );

    expect(response.status).toBe(200);
    expect(listRequestLogsMock).toHaveBeenCalledWith(
      1,
      1,
      expect.objectContaining({ id: "log-1" })
    );
  });

  it("forwards the user_id query parameter into list filters", async () => {
    const { GET } = await import("@/app/api/admin/logs/route");
    listRequestLogsMock.mockResolvedValueOnce({
      items: [{ id: "log-9" }],
      total: 1,
      page: 1,
      pageSize: 1,
      totalPages: 1,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/admin/logs?user_id=user-1&page_size=1", {
        headers: { authorization: AUTH_HEADER },
      })
    );

    expect(response.status).toBe(200);
    expect(listRequestLogsMock).toHaveBeenCalledWith(
      1,
      1,
      expect.objectContaining({ userId: "user-1" })
    );
  });

  it("ignores empty user_id query parameter", async () => {
    const { GET } = await import("@/app/api/admin/logs/route");
    listRequestLogsMock.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/admin/logs?user_id=", {
        headers: { authorization: AUTH_HEADER },
      })
    );

    expect(response.status).toBe(200);
    const callArgs = listRequestLogsMock.mock.calls[0][2] as Record<string, unknown>;
    expect(callArgs.userId).toBeUndefined();
  });

  it("ignores empty id query parameter", async () => {
    const { GET } = await import("@/app/api/admin/logs/route");
    listRequestLogsMock.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/admin/logs?id=", {
        headers: { authorization: AUTH_HEADER },
      })
    );

    expect(response.status).toBe(200);
    const callArgs = listRequestLogsMock.mock.calls[0][2] as Record<string, unknown>;
    expect(callArgs.id).toBeUndefined();
  });

  it("rejects requests without admin auth", async () => {
    const { GET } = await import("@/app/api/admin/logs/route");

    const response = await GET(new NextRequest("http://localhost/api/admin/logs?id=log-1"));

    expect(response.status).toBe(401);
    expect(listRequestLogsMock).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric status_code with 400", async () => {
    const { GET } = await import("@/app/api/admin/logs/route");

    const response = await GET(
      new NextRequest("http://localhost/api/admin/logs?status_code=abc", {
        headers: { authorization: AUTH_HEADER },
      })
    );

    expect(response.status).toBe(400);
    expect(listRequestLogsMock).not.toHaveBeenCalled();
  });

  it("forwards a valid status_class into list filters", async () => {
    const { GET } = await import("@/app/api/admin/logs/route");
    listRequestLogsMock.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/admin/logs?status_class=5xx", {
        headers: { authorization: AUTH_HEADER },
      })
    );

    expect(response.status).toBe(200);
    expect(listRequestLogsMock).toHaveBeenCalledWith(
      1,
      20,
      expect.objectContaining({ statusClass: "5xx" })
    );
  });

  it("rejects an invalid status_class with 400", async () => {
    const { GET } = await import("@/app/api/admin/logs/route");

    const response = await GET(
      new NextRequest("http://localhost/api/admin/logs?status_class=3xx", {
        headers: { authorization: AUTH_HEADER },
      })
    );

    expect(response.status).toBe(400);
    expect(listRequestLogsMock).not.toHaveBeenCalled();
  });
});
