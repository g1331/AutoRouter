import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";
import { existsSync, readFileSync } from "fs";

/**
 * Fernet-compatible encryption for secure storage of upstream API keys.
 *
 * Fernet format:
 * - Version (1 byte) = 0x80
 * - Timestamp (8 bytes, big-endian seconds since epoch)
 * - IV (16 bytes)
 * - Ciphertext (variable, AES-128-CBC, PKCS7 padded)
 * - HMAC-SHA256 (32 bytes, over version + timestamp + IV + ciphertext)
 *
 * Key format: 32 bytes base64-encoded (44 characters with padding)
 * - First 16 bytes: signing key (for HMAC)
 * - Last 16 bytes: encryption key (for AES)
 */

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}

const FERNET_VERSION = 0x80;

let _encryptionKey: Buffer | null = null;
let _signingKey: Buffer | null = null;
let _encryptKey: Buffer | null = null;

/**
 * Load and parse the Fernet encryption key.
 */
function loadEncryptionKey(): void {
  const keyStr = process.env.ENCRYPTION_KEY;
  const keyFile = process.env.ENCRYPTION_KEY_FILE;

  let keyData: string | undefined;

  if (keyStr) {
    keyData = keyStr;
  } else if (keyFile) {
    // In production, read from file
    if (!existsSync(keyFile)) {
      throw new EncryptionError(`ENCRYPTION_KEY_FILE not found: ${keyFile}`);
    }
    keyData = readFileSync(keyFile, "utf-8").trim();
  }

  if (!keyData) {
    throw new EncryptionError(
      "ENCRYPTION_KEY is required. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }

  try {
    _encryptionKey = Buffer.from(keyData, "base64");
    if (_encryptionKey.length !== 32) {
      throw new Error("Key must be 32 bytes");
    }
    _signingKey = _encryptionKey.subarray(0, 16);
    _encryptKey = _encryptionKey.subarray(16, 32);
  } catch (e) {
    throw new EncryptionError(`Invalid ENCRYPTION_KEY: ${e}`);
  }
}

/**
 * Ensure encryption key is loaded.
 */
function ensureKeyLoaded(): void {
  if (!_encryptionKey) {
    loadEncryptionKey();
  }
}

/**
 * Encrypt a plaintext string using Fernet format.
 *
 * @param plaintext - The string to encrypt
 * @returns Base64-encoded Fernet token
 */
export function encrypt(plaintext: string): string {
  ensureKeyLoaded();

  const iv = randomBytes(16);
  const timestamp = BigInt(Math.floor(Date.now() / 1000));

  // Create cipher and encrypt
  const cipher = createCipheriv("aes-128-cbc", _encryptKey!, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);

  // Build the token (without HMAC first)
  const version = Buffer.from([FERNET_VERSION]);
  const timestampBuf = Buffer.alloc(8);
  timestampBuf.writeBigUInt64BE(timestamp);

  const tokenBase = Buffer.concat([version, timestampBuf, iv, encrypted]);

  // Calculate HMAC
  const hmac = createHmac("sha256", _signingKey!).update(tokenBase).digest();

  // Final token
  const token = Buffer.concat([tokenBase, hmac]);

  return token.toString("base64url").replace(/-/g, "+").replace(/_/g, "/");
}

/**
 * Decrypt a Fernet token.
 *
 * @param token - Base64-encoded Fernet token
 * @returns Decrypted plaintext string
 */
export function decrypt(token: string): string {
  ensureKeyLoaded();

  try {
    // Normalize base64 (URL-safe to standard)
    const normalizedToken = token.replace(/-/g, "+").replace(/_/g, "/");
    const data = Buffer.from(normalizedToken, "base64");

    if (data.length < 57) {
      // 1 + 8 + 16 + 16 + 32 minimum
      throw new EncryptionError("Invalid token: too short");
    }

    // Parse token components
    const version = data[0];
    if (version !== FERNET_VERSION) {
      throw new EncryptionError(`Invalid token version: ${version}`);
    }

    // Skip timestamp bytes (1-9) - could be used for expiration validation
    const iv = data.subarray(9, 25);
    const ciphertext = data.subarray(25, data.length - 32);
    const hmac = data.subarray(data.length - 32);

    // Verify HMAC
    const tokenBase = data.subarray(0, data.length - 32);
    const expectedHmac = createHmac("sha256", _signingKey!).update(tokenBase).digest();

    if (!hmac.equals(expectedHmac)) {
      throw new EncryptionError("Invalid token: HMAC verification failed");
    }

    // Decrypt
    const decipher = createDecipheriv("aes-128-cbc", _encryptKey!, iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return decrypted.toString("utf-8");
  } catch (e) {
    if (e instanceof EncryptionError) {
      throw e;
    }
    throw new EncryptionError(`Decryption failed: ${e}`);
  }
}

/**
 * Generate a new Fernet-compatible encryption key.
 *
 * @returns Base64-encoded 32-byte key
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString("base64");
}

// Aliases for compatibility with Python naming
export const encryptUpstreamKey = encrypt;
export const decryptUpstreamKey = decrypt;
