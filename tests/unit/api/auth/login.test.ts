import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The user lookup is mocked; mockLimit yields the queried rows.
const mockLimit = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: (...args: unknown[]) => mockLimit(...args),
        }),
      }),
    }),
  },
  users: {
    id: "id",
    username: "username",
    displayName: "display_name",
    passwordHash: "password_hash",
    role: "role",
    isActive: "is_active",
  },
}));

const mockSignUserToken = vi.fn();
vi.mock("@/lib/utils/jwt", () => ({
  signUserToken: (...args: unknown[]) => mockSignUserToken(...args),
  verifyUserToken: vi.fn(),
}));

// verifyPassword and hashPassword are mocked to avoid real bcrypt cost; the
// actual normalizeUsername is preserved so normalization stays exercised.
const mockVerifyPassword = vi.fn();
vi.mock("@/lib/utils/auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/auth")>();
  return {
    ...actual,
    verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
    hashPassword: vi.fn(async () => "$2a$12$equalizerequalizerequalizerequalizeru"),
  };
});

const mockCheck = vi.fn();
const mockRecordFailure = vi.fn();
const mockRecordSuccess = vi.fn();
vi.mock("@/lib/services/login-rate-limiter", () => ({
  checkLoginRateLimit: (...args: unknown[]) => mockCheck(...args),
  recordLoginFailure: (...args: unknown[]) => mockRecordFailure(...args),
  recordLoginSuccess: (...args: unknown[]) => mockRecordSuccess(...args),
}));

import { POST } from "@/app/api/auth/login/route";

function loginRequest(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function activeUser(overrides?: Record<string, unknown>) {
  return {
    id: "u1",
    username: "alice",
    displayName: "Alice",
    passwordHash: "stored-hash",
    role: "admin",
    isActive: true,
    ...overrides,
  };
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheck.mockReturnValue({ allowed: true });
  });

  it("issues a JWT and returns the profile on valid credentials", async () => {
    mockLimit.mockResolvedValue([activeUser()]);
    mockVerifyPassword.mockResolvedValue(true);
    mockSignUserToken.mockResolvedValue("jwt-token");

    const response = await POST(loginRequest({ username: "alice", password: "secret123" }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      token: "jwt-token",
      user: { id: "u1", username: "alice", displayName: "Alice", role: "admin" },
    });
    expect(mockSignUserToken).toHaveBeenCalledWith({ userId: "u1", role: "admin" });
    expect(mockRecordSuccess).toHaveBeenCalledWith("alice", expect.any(String));
    expect(mockRecordFailure).not.toHaveBeenCalled();
  });

  it("rejects a wrong password with a generic 401 and records the failure", async () => {
    mockLimit.mockResolvedValue([activeUser({ role: "member" })]);
    mockVerifyPassword.mockResolvedValue(false);

    const response = await POST(loginRequest({ username: "alice", password: "wrong" }));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Invalid username or password");
    expect(mockSignUserToken).not.toHaveBeenCalled();
    expect(mockRecordFailure).toHaveBeenCalledWith("alice", expect.any(String));
    expect(mockRecordSuccess).not.toHaveBeenCalled();
  });

  it("rejects an inactive account with the same 401", async () => {
    mockLimit.mockResolvedValue([activeUser({ isActive: false })]);

    const response = await POST(loginRequest({ username: "alice", password: "secret123" }));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Invalid username or password");
    expect(mockSignUserToken).not.toHaveBeenCalled();
    expect(mockRecordFailure).toHaveBeenCalled();
  });

  it("rejects a non-existent username with an identical 401", async () => {
    mockLimit.mockResolvedValue([]);

    const response = await POST(loginRequest({ username: "ghost", password: "secret123" }));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Invalid username or password");
    expect(mockSignUserToken).not.toHaveBeenCalled();
    expect(mockRecordFailure).toHaveBeenCalledWith("ghost", expect.any(String));
  });

  it("returns 429 with Retry-After when rate limited, before touching the DB", async () => {
    mockCheck.mockReturnValue({ allowed: false, retryAfterSeconds: 120 });

    const response = await POST(loginRequest({ username: "alice", password: "secret123" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("normalizes the username before the rate-limit and lookup", async () => {
    mockLimit.mockResolvedValue([activeUser()]);
    mockVerifyPassword.mockResolvedValue(true);
    mockSignUserToken.mockResolvedValue("jwt-token");

    await POST(loginRequest({ username: "  Alice  ", password: "secret123" }));
    expect(mockCheck).toHaveBeenCalledWith("alice", expect.any(String));
    expect(mockRecordSuccess).toHaveBeenCalledWith("alice", expect.any(String));
  });

  it("returns 400 when a field is missing", async () => {
    const response = await POST(loginRequest({ username: "alice" }));
    expect(response.status).toBe(400);
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid JSON body", async () => {
    const response = await POST(loginRequest("{not json"));
    expect(response.status).toBe(400);
  });

  it("uses the source IP from x-forwarded-for as a rate-limit dimension", async () => {
    mockLimit.mockResolvedValue([]);

    await POST(
      loginRequest(
        { username: "alice", password: "secret123" },
        { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }
      )
    );
    expect(mockCheck).toHaveBeenCalledWith("alice", "203.0.113.7");
  });
});
