// @vitest-environment node
import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { deriveJwtKey, signJwt, verifyJwt, type UserTokenClaims } from "@/lib/utils/jwt";

// 32-byte key [0,1,...,31] encoded as base64 — deterministic test material.
const TEST_ENCRYPTION_KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)));

function decodeJwtPayload(token: string): Record<string, unknown> {
  const b64url = token.split(".")[1];
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

describe("lib/utils/jwt", () => {
  describe("deriveJwtKey", () => {
    it("uses JWT_SECRET verbatim when provided", async () => {
      const key = await deriveJwtKey("my-secret", undefined);
      expect(key).toEqual(new TextEncoder().encode("my-secret"));
    });

    it("prefers JWT_SECRET over ENCRYPTION_KEY", async () => {
      const key = await deriveJwtKey("my-secret", TEST_ENCRYPTION_KEY);
      expect(key).toEqual(new TextEncoder().encode("my-secret"));
    });

    it("derives a deterministic 32-byte key from ENCRYPTION_KEY via HKDF", async () => {
      const a = await deriveJwtKey(undefined, TEST_ENCRYPTION_KEY);
      const b = await deriveJwtKey(undefined, TEST_ENCRYPTION_KEY);
      expect(a.length).toBe(32);
      expect(Array.from(a)).toEqual(Array.from(b));
    });

    it("derives a signing key distinct from the raw encryption key bytes", async () => {
      const derived = await deriveJwtKey(undefined, TEST_ENCRYPTION_KEY);
      const raw = Uint8Array.from({ length: 32 }, (_, i) => i);
      expect(Array.from(derived)).not.toEqual(Array.from(raw));
    });

    it("fails fast when neither secret is configured", async () => {
      await expect(deriveJwtKey(undefined, undefined)).rejects.toThrow(
        /JWT signing key unavailable/
      );
    });

    it("decodes URL-safe ENCRYPTION_KEY identically to standard base64", async () => {
      const allOnes = String.fromCharCode(...Array.from({ length: 32 }, () => 0xff));
      const standard = btoa(allOnes); // contains '/'
      const urlSafe = standard.replace(/\+/g, "-").replace(/\//g, "_");
      const fromStandard = await deriveJwtKey(undefined, standard);
      const fromUrlSafe = await deriveJwtKey(undefined, urlSafe);
      expect(Array.from(fromUrlSafe)).toEqual(Array.from(fromStandard));
    });
  });

  describe("signJwt / verifyJwt", () => {
    const claims: UserTokenClaims = { userId: "user-123", role: "admin" };

    it("round-trips claims through sign and verify", async () => {
      const key = await deriveJwtKey(undefined, TEST_ENCRYPTION_KEY);
      const token = await signJwt(claims, key);
      const result = await verifyJwt(token, key);
      expect(result).toEqual(claims);
    });

    it("does not embed the username in the payload", async () => {
      const key = await deriveJwtKey(undefined, TEST_ENCRYPTION_KEY);
      const token = await signJwt(claims, key);
      const payload = decodeJwtPayload(token);
      expect(payload).toHaveProperty("userId", "user-123");
      expect(payload).toHaveProperty("role", "admin");
      expect(payload).not.toHaveProperty("username");
      expect(payload).toHaveProperty("exp");
    });

    it("rejects a token signed with a different key", async () => {
      const key = await deriveJwtKey(undefined, TEST_ENCRYPTION_KEY);
      const otherKey = await deriveJwtKey("another-secret", undefined);
      const token = await signJwt(claims, key);
      expect(await verifyJwt(token, otherKey)).toBeNull();
    });

    it("rejects an alg=none token", async () => {
      const key = await deriveJwtKey(undefined, TEST_ENCRYPTION_KEY);
      const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" })).replace(/=/g, "");
      const body = btoa(JSON.stringify({ userId: "user-123", role: "admin" })).replace(/=/g, "");
      const unsigned = `${header}.${body}.`;
      expect(await verifyJwt(unsigned, key)).toBeNull();
    });

    it("rejects a malformed token", async () => {
      const key = await deriveJwtKey(undefined, TEST_ENCRYPTION_KEY);
      expect(await verifyJwt("not-a-jwt", key)).toBeNull();
    });

    it("rejects a token whose role claim is not a known role", async () => {
      const key = await deriveJwtKey(undefined, TEST_ENCRYPTION_KEY);
      const token = await signJwt(
        { userId: "u", role: "superuser" } as unknown as UserTokenClaims,
        key
      );
      expect(await verifyJwt(token, key)).toBeNull();
    });

    it("rejects a token without an exp claim", async () => {
      const key = await deriveJwtKey(undefined, TEST_ENCRYPTION_KEY);
      const token = await new SignJWT({ userId: "u", role: "admin" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .sign(key);
      expect(await verifyJwt(token, key)).toBeNull();
    });

    it("rejects an expired token", async () => {
      const key = await deriveJwtKey(undefined, TEST_ENCRYPTION_KEY);
      const token = await new SignJWT({ userId: "u", role: "admin" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(0)
        .setExpirationTime(1)
        .sign(key);
      expect(await verifyJwt(token, key)).toBeNull();
    });

    it("rejects a token signed with a non-allowed algorithm (downgrade guard)", async () => {
      // HS512 header on a 64-byte key; verifyJwt pins HS256, so the token is
      // rejected at the algorithm allowlist (ERR_JOSE_ALG_NOT_ALLOWED) before any
      // signature check — a different jose branch from the alg=none case.
      const longKey = new Uint8Array(64).fill(7);
      const token = await new SignJWT({ userId: "u", role: "admin" })
        .setProtectedHeader({ alg: "HS512" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(longKey);
      expect(await verifyJwt(token, longKey)).toBeNull();
    });

    it("rejects a token missing the userId claim", async () => {
      const key = await deriveJwtKey(undefined, TEST_ENCRYPTION_KEY);
      const token = await new SignJWT({ role: "admin" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(key);
      expect(await verifyJwt(token, key)).toBeNull();
    });
  });
});
