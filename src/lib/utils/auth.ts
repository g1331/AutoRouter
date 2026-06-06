import bcryptjs from "bcryptjs";
import { config, validateAdminToken } from "./config";
import { decrypt, EncryptionError } from "./encryption";

const BCRYPT_ROUNDS = 12;

/**
 * Hash an API key using bcrypt.
 *
 * @param key - The plaintext API key to hash
 * @returns The bcrypt hash
 */
export async function hashApiKey(key: string): Promise<string> {
  return bcryptjs.hash(key, BCRYPT_ROUNDS);
}

/**
 * Verify an API key against a bcrypt hash.
 *
 * @param key - The plaintext API key to verify
 * @param hash - The bcrypt hash to compare against
 * @returns True if the key matches the hash
 */
export async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  try {
    return await bcryptjs.compare(key, hash);
  } catch {
    return false;
  }
}

/**
 * Minimum length enforced for user passwords.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Hash a user password using bcrypt.
 *
 * Shares the same bcrypt cost factor as API key hashing.
 *
 * @param password - The plaintext password to hash
 * @returns The bcrypt hash
 */
export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a user password against a bcrypt hash.
 *
 * @param password - The plaintext password to verify
 * @param hash - The bcrypt hash to compare against
 * @returns True if the password matches the hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcryptjs.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * Check whether a password meets the minimum strength requirement.
 *
 * @param password - The plaintext password to check
 * @returns True if the password satisfies the minimum length
 */
export function isPasswordStrong(password: string): boolean {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}

/**
 * Extract API key from Authorization header.
 *
 * Supports both "Bearer <key>" and raw key formats.
 *
 * @param authHeader - The Authorization header value
 * @returns The extracted key, or null if invalid
 */
export function extractApiKey(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  // Support "Bearer <key>" format
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  // Support raw key format
  return authHeader.trim();
}

/**
 * Extract key prefix from an API key.
 *
 * @param key - The full API key
 * @returns The first 12 characters as the prefix
 */
export function getKeyPrefix(key: string): string {
  return key.slice(0, 12);
}

/**
 * Validate admin token from request headers.
 *
 * @param authHeader - The Authorization header value
 * @returns True if the token is valid
 */
export function validateAdminAuth(authHeader: string | null): boolean {
  const token = extractApiKey(authHeader);
  return validateAdminToken(token);
}

/**
 * Reveal a stored encrypted API key.
 *
 * @param encryptedKey - The encrypted key value
 * @param keyHash - The bcrypt hash to verify against
 * @returns The decrypted key if verification passes
 * @throws Error if decryption fails or verification fails
 */
export async function revealApiKey(encryptedKey: string | null, keyHash: string): Promise<string> {
  if (!encryptedKey) {
    throw new Error("Cannot reveal legacy bcrypt-only key");
  }

  if (!config.allowKeyReveal) {
    throw new Error("Key reveal is disabled");
  }

  try {
    const decryptedKey = decrypt(encryptedKey);

    // Verify the decrypted key matches the hash
    const isValid = await verifyApiKey(decryptedKey, keyHash);
    if (!isValid) {
      throw new Error("Decrypted key does not match hash");
    }

    return decryptedKey;
  } catch (e) {
    if (e instanceof EncryptionError) {
      throw new Error(`Failed to decrypt key: ${e.message}`);
    }
    throw e;
  }
}

// Re-export for convenience
export { validateAdminToken };
