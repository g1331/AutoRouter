import { eq, desc, count } from "drizzle-orm";
import { db, upstreams, type Upstream } from "../db";
import { encrypt, decrypt } from "../utils/encryption";

const MIN_KEY_LENGTH_FOR_MASKING = 7;

export class UpstreamNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamNotFoundError";
  }
}

/**
 * Error thrown when upstream connection test fails due to authentication issues.
 */
export class UpstreamAuthenticationError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "UpstreamAuthenticationError";
  }
}

/**
 * Error thrown when upstream connection test fails due to network issues.
 */
export class UpstreamNetworkError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = "UpstreamNetworkError";
  }
}

/**
 * Error thrown when upstream connection test times out.
 */
export class UpstreamTimeoutError extends Error {
  constructor(message: string, public timeoutSeconds: number) {
    super(message);
    this.name = "UpstreamTimeoutError";
  }
}

export interface UpstreamCreateInput {
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  isDefault?: boolean;
  timeout?: number;
  config?: string | null;
}

export interface UpstreamUpdateInput {
  name?: string;
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  isDefault?: boolean;
  timeout?: number;
  isActive?: boolean;
  config?: string | null;
}

export interface UpstreamResponse {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKeyMasked: string;
  isDefault: boolean;
  timeout: number;
  isActive: boolean;
  config: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedUpstreams {
  items: UpstreamResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Input for testing upstream connection.
 * Can be used to test either a new configuration or an existing upstream.
 */
export interface TestUpstreamInput {
  /** Provider type (openai or anthropic) */
  provider: string;
  /** Base URL of the upstream API */
  baseUrl: string;
  /** API key for authentication (plain text, will not be stored) */
  apiKey: string;
  /** Optional timeout in seconds (defaults to 10) */
  timeout?: number;
}

/**
 * Result of testing an upstream connection.
 */
export interface TestUpstreamResult {
  /** Whether the test was successful */
  success: boolean;
  /** Human-readable status message */
  message: string;
  /** Response time in milliseconds (null if test failed before making request) */
  latencyMs: number | null;
  /** HTTP status code from the test request (null if network error) */
  statusCode: number | null;
  /** Error type for failed tests */
  errorType?: "authentication" | "network" | "timeout" | "invalid_response" | "unknown";
  /** Detailed error message for debugging */
  errorDetails?: string;
  /** Timestamp when the test was performed */
  testedAt: Date;
}

/**
 * Mask an API key for display (e.g., 'sk-***1234').
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= MIN_KEY_LENGTH_FOR_MASKING) {
    return "***";
  }

  const prefix = apiKey.startsWith("sk-") ? apiKey.slice(0, 3) : apiKey.slice(0, 2);
  const suffix = apiKey.slice(-4);
  return `${prefix}***${suffix}`;
}

/**
 * Create a new upstream with encrypted API key.
 */
export async function createUpstream(input: UpstreamCreateInput): Promise<UpstreamResponse> {
  const { name, provider, baseUrl, apiKey, isDefault = false, timeout = 60, config } = input;

  // Check if name already exists
  const existing = await db.query.upstreams.findFirst({
    where: eq(upstreams.name, name),
  });

  if (existing) {
    throw new Error(`Upstream with name '${name}' already exists`);
  }

  // Encrypt the API key
  const apiKeyEncrypted = encrypt(apiKey);

  const now = new Date();

  // Create upstream record
  const [newUpstream] = await db
    .insert(upstreams)
    .values({
      name,
      provider,
      baseUrl,
      apiKeyEncrypted,
      isDefault,
      timeout,
      isActive: true,
      config: config ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  console.warn(`Created upstream: ${name}, provider=${provider}, default=${isDefault}`);

  return {
    id: newUpstream.id,
    name: newUpstream.name,
    provider: newUpstream.provider,
    baseUrl: newUpstream.baseUrl,
    apiKeyMasked: maskApiKey(apiKey),
    isDefault: newUpstream.isDefault,
    timeout: newUpstream.timeout,
    isActive: newUpstream.isActive,
    config: newUpstream.config,
    createdAt: newUpstream.createdAt,
    updatedAt: newUpstream.updatedAt,
  };
}

/**
 * Update an existing upstream.
 */
export async function updateUpstream(
  upstreamId: string,
  input: UpstreamUpdateInput
): Promise<UpstreamResponse> {
  const existing = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, upstreamId),
  });

  if (!existing) {
    throw new UpstreamNotFoundError(`Upstream not found: ${upstreamId}`);
  }

  // Check name uniqueness if changing name
  if (input.name && input.name !== existing.name) {
    const nameConflict = await db.query.upstreams.findFirst({
      where: eq(upstreams.name, input.name),
    });
    if (nameConflict) {
      throw new Error(`Upstream with name '${input.name}' already exists`);
    }
  }

  // Build update values
  const updateValues: Partial<typeof upstreams.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateValues.name = input.name;
  if (input.provider !== undefined) updateValues.provider = input.provider;
  if (input.baseUrl !== undefined) updateValues.baseUrl = input.baseUrl;
  if (input.apiKey !== undefined) updateValues.apiKeyEncrypted = encrypt(input.apiKey);
  if (input.isDefault !== undefined) updateValues.isDefault = input.isDefault;
  if (input.timeout !== undefined) updateValues.timeout = input.timeout;
  if (input.isActive !== undefined) updateValues.isActive = input.isActive;
  if (input.config !== undefined) updateValues.config = input.config;

  const [updated] = await db
    .update(upstreams)
    .set(updateValues)
    .where(eq(upstreams.id, upstreamId))
    .returning();

  console.warn(`Updated upstream: ${updated.name}`);

  // Decrypt key for masking
  const decryptedKey = decrypt(updated.apiKeyEncrypted);

  return {
    id: updated.id,
    name: updated.name,
    provider: updated.provider,
    baseUrl: updated.baseUrl,
    apiKeyMasked: maskApiKey(decryptedKey),
    isDefault: updated.isDefault,
    timeout: updated.timeout,
    isActive: updated.isActive,
    config: updated.config,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

/**
 * Delete an upstream from the database.
 */
export async function deleteUpstream(upstreamId: string): Promise<void> {
  const existing = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, upstreamId),
  });

  if (!existing) {
    throw new UpstreamNotFoundError(`Upstream not found: ${upstreamId}`);
  }

  await db.delete(upstreams).where(eq(upstreams.id, upstreamId));

  console.warn(`Deleted upstream: ${existing.name}`);
}

/**
 * List all upstreams with pagination and masked API keys.
 */
export async function listUpstreams(
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedUpstreams> {
  // Validate pagination params
  page = Math.max(1, page);
  pageSize = Math.min(100, Math.max(1, pageSize));

  // Count total upstreams
  const [{ value: total }] = await db.select({ value: count() }).from(upstreams);

  // Query paginated results (ordered by created_at desc)
  const offset = (page - 1) * pageSize;
  const upstreamList = await db.query.upstreams.findMany({
    orderBy: [desc(upstreams.createdAt)],
    limit: pageSize,
    offset,
  });

  // Build response items with masked API keys
  const items: UpstreamResponse[] = upstreamList.map((upstream) => {
    let maskedKey: string;
    try {
      const decryptedKey = decrypt(upstream.apiKeyEncrypted);
      maskedKey = maskApiKey(decryptedKey);
    } catch (e) {
      console.error(`Failed to decrypt upstream key for masking: ${upstream.name}, error: ${e}`);
      maskedKey = "***error***";
    }

    return {
      id: upstream.id,
      name: upstream.name,
      provider: upstream.provider,
      baseUrl: upstream.baseUrl,
      apiKeyMasked: maskedKey,
      isDefault: upstream.isDefault,
      timeout: upstream.timeout,
      isActive: upstream.isActive,
      config: upstream.config,
      createdAt: upstream.createdAt,
      updatedAt: upstream.updatedAt,
    };
  });

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Get upstream by ID.
 */
export async function getUpstreamById(upstreamId: string): Promise<UpstreamResponse | null> {
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, upstreamId),
  });

  if (!upstream) {
    return null;
  }

  let maskedKey: string;
  try {
    const decryptedKey = decrypt(upstream.apiKeyEncrypted);
    maskedKey = maskApiKey(decryptedKey);
  } catch {
    maskedKey = "***error***";
  }

  return {
    id: upstream.id,
    name: upstream.name,
    provider: upstream.provider,
    baseUrl: upstream.baseUrl,
    apiKeyMasked: maskedKey,
    isDefault: upstream.isDefault,
    timeout: upstream.timeout,
    isActive: upstream.isActive,
    config: upstream.config,
    createdAt: upstream.createdAt,
    updatedAt: upstream.updatedAt,
  };
}

/**
 * Load all active upstreams from database.
 */
export async function loadActiveUpstreams(): Promise<Upstream[]> {
  return db.query.upstreams.findMany({
    where: eq(upstreams.isActive, true),
  });
}

/**
 * Get default upstream.
 */
export async function getDefaultUpstream(): Promise<Upstream | null> {
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.isDefault, true),
  });
  return upstream ?? null;
}

/**
 * Get upstream by name.
 */
export async function getUpstreamByName(name: string): Promise<Upstream | null> {
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.name, name),
  });
  return upstream ?? null;
}

/**
 * Get decrypted API key for an upstream (used for proxying).
 */
export function getDecryptedApiKey(upstream: Upstream): string {
  return decrypt(upstream.apiKeyEncrypted);
}
