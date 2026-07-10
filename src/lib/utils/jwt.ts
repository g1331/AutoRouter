import { SignJWT, jwtVerify } from "jose";
import { config } from "./config";
import { getEncryptionKeyBase64 } from "./encryption";

/**
 * JWT signing and verification utilities.
 *
 * The signing key is resolved from configuration in priority order:
 * 1. JWT_SECRET, used directly as the HMAC secret.
 * 2. ENCRYPTION_KEY, from which an independent signing key is derived via
 *    HKDF (SHA-256) so the JWT signing domain stays cryptographically isolated
 *    from the data-encryption domain.
 * 3. Neither configured — the key resolver fails fast and refuses to sign or
 *    verify, never falling back to a predictable empty-derived key.
 *
 * Key derivation uses the Web Crypto API (crypto.subtle) rather than Node's
 * crypto.hkdfSync so the module stays compatible with the Edge Runtime, matching
 * jose's own runtime support.
 */

const JWT_ALG = "HS256";
const JWT_EXPIRATION = "24h";
const HKDF_INFO = "autorouter-jwt-v1";

/**
 * Claims carried by an AutoRouter user JWT. Only the fields required for
 * authorization are present; the username is intentionally excluded because a
 * JWT payload is only signed (not encrypted) and can be decoded by any holder.
 */
export interface UserTokenClaims {
  userId: string;
  role: "admin" | "member";
}

/**
 * Decode a base64 string into raw bytes using a Web-compatible path (atob),
 * avoiding Node's Buffer so the function works under the Edge Runtime.
 *
 * URL-safe input is normalized to standard base64 first, matching the decoding
 * tolerance of encryption.ts so the same ENCRYPTION_KEY yields identical bytes
 * in both the Fernet and JWT signing-key domains.
 *
 * @param base64 - Standard or URL-safe base64 string
 * @returns The decoded bytes
 */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Resolve the HMAC signing key from the provided secrets.
 *
 * @param jwtSecret - Explicit JWT secret, used verbatim when present
 * @param encryptionKey - Base64 Fernet key used to derive a signing key when no
 *   explicit JWT secret is configured
 * @returns The signing key bytes
 * @throws Error when neither a JWT secret nor an encryption key is available
 */
export async function deriveJwtKey(
  jwtSecret?: string,
  encryptionKey?: string
): Promise<Uint8Array> {
  if (jwtSecret) {
    return new TextEncoder().encode(jwtSecret);
  }

  if (encryptionKey) {
    const ikm = base64ToBytes(encryptionKey);
    const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(0),
        info: new TextEncoder().encode(HKDF_INFO),
      },
      baseKey,
      256
    );
    return new Uint8Array(derivedBits);
  }

  throw new Error("JWT signing key unavailable: set JWT_SECRET or ENCRYPTION_KEY");
}

/**
 * Sign a user JWT with an explicit key.
 *
 * @param claims - The user identity and role to embed
 * @param key - The HMAC signing key
 * @returns The signed compact JWT
 */
export async function signJwt(claims: UserTokenClaims, key: Uint8Array): Promise<string> {
  return new SignJWT({ userId: claims.userId, role: claims.role })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(key);
}

/**
 * Verify a user JWT with an explicit key.
 *
 * The verifier pins the allowed algorithm to HS256, which rejects `alg=none`
 * and algorithm downgrade attempts. Any verification failure (bad signature,
 * expiry, malformed token, unexpected claim shape) resolves to null rather than
 * throwing.
 *
 * @param token - The compact JWT to verify
 * @param key - The HMAC signing key
 * @returns The validated claims, or null when verification fails
 */
export async function verifyJwt(token: string, key: Uint8Array): Promise<UserTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: [JWT_ALG],
      requiredClaims: ["exp"],
    });
    const userId = payload.userId;
    const role = payload.role;
    if (typeof userId !== "string" || (role !== "admin" && role !== "member")) {
      return null;
    }
    return { userId, role };
  } catch {
    return null;
  }
}

let cachedKey: Promise<Uint8Array> | null = null;

/**
 * Resolve and cache the configured signing key. The encryption key is resolved
 * through encryption.ts so both ENCRYPTION_KEY and ENCRYPTION_KEY_FILE are
 * honored, keeping the JWT signing domain in sync with the Fernet domain.
 *
 * A failed resolution is not cached, so a transient derivation failure does not
 * permanently poison the cache and a later call can retry. Configuration itself
 * is a load-time singleton; recovering from missing secrets still requires a
 * process restart.
 *
 * @returns The configured signing key bytes
 */
function getSigningKey(): Promise<Uint8Array> {
  if (!cachedKey) {
    const pending = (async () =>
      deriveJwtKey(config.jwtSecret, getEncryptionKeyBase64() ?? undefined))();
    cachedKey = pending;
    pending.catch(() => {
      if (cachedKey === pending) {
        cachedKey = null;
      }
    });
  }
  return cachedKey;
}

/**
 * Sign a user JWT using the configured signing key.
 *
 * @param claims - The user identity and role to embed
 * @returns The signed compact JWT
 */
export async function signUserToken(claims: UserTokenClaims): Promise<string> {
  return signJwt(claims, await getSigningKey());
}

/**
 * Verify a user JWT using the configured signing key.
 *
 * @param token - The compact JWT to verify
 * @returns The validated claims, or null when verification fails
 */
export async function verifyUserToken(token: string): Promise<UserTokenClaims | null> {
  return verifyJwt(token, await getSigningKey());
}

/**
 * Claim scope marking a JWT as an ADMIN_TOKEN-derived super-admin session. The
 * bootstrap ADMIN_TOKEN never leaves the browser as a stored credential after
 * login; the token-login endpoint mints this short-lived JWT instead, so the
 * browser can persist a "remember me" session without ever writing the
 * permanent, non-expiring ADMIN_TOKEN to disk.
 */
const ADMIN_SESSION_SCOPE = "admin_session";

/**
 * Sign a super-admin session JWT with an explicit key (no user identity, 24h
 * expiry). The payload carries only the admin-session scope marker.
 *
 * @param key - The HMAC signing key
 * @returns The signed compact JWT
 */
export async function signAdminSessionJwt(key: Uint8Array): Promise<string> {
  return new SignJWT({ scope: ADMIN_SESSION_SCOPE })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(key);
}

/**
 * Verify a super-admin session JWT with an explicit key. Returns true only for a
 * well-formed, unexpired token whose scope claim marks it as an admin session;
 * any failure (bad signature, expiry, wrong or absent scope) resolves to false.
 * Pins HS256 to reject alg=none and downgrade attempts.
 *
 * @param token - The compact JWT to verify
 * @param key - The HMAC signing key
 * @returns True when the token is a valid admin session JWT
 */
export async function verifyAdminSessionJwt(token: string, key: Uint8Array): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: [JWT_ALG],
      requiredClaims: ["exp"],
    });
    return payload.scope === ADMIN_SESSION_SCOPE;
  } catch {
    return false;
  }
}

/**
 * Sign a super-admin session JWT using the configured signing key.
 *
 * @returns The signed compact JWT
 */
export async function signAdminSessionToken(): Promise<string> {
  return signAdminSessionJwt(await getSigningKey());
}

/**
 * Verify a super-admin session JWT using the configured signing key.
 * authenticate() maps a valid token to the `admin_token` principal.
 *
 * @param token - The compact JWT to verify
 * @returns True when the token is a valid admin session JWT
 */
export async function verifyAdminSessionToken(token: string): Promise<boolean> {
  return verifyAdminSessionJwt(token, await getSigningKey());
}
