import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// api-auth (imported for errorResponse + safeEqual) pulls in the db barrel at
// module load; stub it so loading the route does not touch a real database.
vi.mock("@/lib/db", () => ({ db: {}, users: {} }));

vi.mock("@/lib/utils/config", () => ({
  config: { adminToken: "secret-admin-token" },
}));

const mockSignAdminSessionToken = vi.fn();
vi.mock("@/lib/utils/jwt", () => ({
  signAdminSessionToken: (...args: unknown[]) => mockSignAdminSessionToken(...args),
  verifyUserToken: vi.fn(),
  verifyAdminSessionToken: vi.fn(),
}));

const mockCheck = vi.fn();
const mockRecordFailure = vi.fn();
const mockRecordSuccess = vi.fn();
vi.mock("@/lib/services/login-rate-limiter", () => ({
  checkLoginRateLimit: (...args: unknown[]) => mockCheck(...args),
  recordLoginFailure: (...args: unknown[]) => mockRecordFailure(...args),
  recordLoginSuccess: (...args: unknown[]) => mockRecordSuccess(...args),
}));

import { POST } from "@/app/api/auth/token-login/route";
import { config } from "@/lib/utils/config";

function tokenRequest(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/auth/token-login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/auth/token-login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheck.mockReturnValue({ allowed: true });
    (config as { adminToken?: string }).adminToken = "secret-admin-token";
  });

  it("exchanges a correct ADMIN_TOKEN for a session JWT and records success", async () => {
    mockSignAdminSessionToken.mockResolvedValue("admin-session-jwt");

    const response = await POST(tokenRequest({ token: "secret-admin-token" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: "admin-session-jwt" });
    expect(mockSignAdminSessionToken).toHaveBeenCalledTimes(1);
    expect(mockRecordSuccess).toHaveBeenCalledWith("__admin_token__");
    expect(mockRecordFailure).not.toHaveBeenCalled();
  });

  it("rejects a wrong token with 401 and records the failure, without minting a JWT", async () => {
    const response = await POST(tokenRequest({ token: "wrong-token" }));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Invalid token");
    expect(mockSignAdminSessionToken).not.toHaveBeenCalled();
    expect(mockRecordFailure).toHaveBeenCalledWith("__admin_token__", expect.any(String));
    expect(mockRecordSuccess).not.toHaveBeenCalled();
  });

  it("rejects any token with 401 when ADMIN_TOKEN is unconfigured", async () => {
    (config as { adminToken?: string }).adminToken = "";

    const response = await POST(tokenRequest({ token: "anything" }));
    expect(response.status).toBe(401);
    expect(mockSignAdminSessionToken).not.toHaveBeenCalled();
    expect(mockRecordFailure).toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when rate limited, before comparing the token", async () => {
    mockCheck.mockReturnValue({ allowed: false, retryAfterSeconds: 90 });

    const response = await POST(tokenRequest({ token: "secret-admin-token" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("90");
    expect(mockSignAdminSessionToken).not.toHaveBeenCalled();
    expect(mockRecordFailure).not.toHaveBeenCalled();
  });

  it("returns 400 when the token field is missing", async () => {
    const response = await POST(tokenRequest({}));
    expect(response.status).toBe(400);
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid JSON body", async () => {
    const response = await POST(tokenRequest("{not json"));
    expect(response.status).toBe(400);
  });

  it("uses the source IP from x-forwarded-for as a rate-limit dimension", async () => {
    await POST(
      tokenRequest({ token: "wrong-token" }, { "x-forwarded-for": "203.0.113.7, 10.0.0.1" })
    );
    expect(mockCheck).toHaveBeenCalledWith("__admin_token__", "203.0.113.7");
  });
});
