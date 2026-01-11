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
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "UpstreamAuthenticationError";
  }
}

/**
 * Error thrown when upstream connection test fails due to network issues.
 */
export class UpstreamNetworkError extends Error {
  constructor(
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = "UpstreamNetworkError";
  }
}

/**
 * Error thrown when upstream connection test times out.
 */
export class UpstreamTimeoutError extends Error {
  constructor(
    message: string,
    public timeoutSeconds: number
  ) {
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

/**
 * Test connection to an upstream provider.
 * Makes a lightweight API call to verify connectivity and authentication.
 *
 * @param input - Test configuration with provider, baseUrl, apiKey, and optional timeout
 * @returns Test result with success status, latency, and error details if applicable
 *
 * @example
 * ```typescript
 * const result = await testUpstreamConnection({
 *   provider: "openai",
 *   baseUrl: "https://api.openai.com",
 *   apiKey: "sk-...",
 *   timeout: 10
 * });
 *
 * if (result.success) {
 *   console.log(`Connected in ${result.latencyMs}ms`);
 * } else {
 *   console.error(result.message);
 * }
 * ```
 */
export async function testUpstreamConnection(
  input: TestUpstreamInput
): Promise<TestUpstreamResult> {
  const { provider, baseUrl, apiKey, timeout = 10 } = input;
  const testedAt = new Date();

  // Validate provider
  if (provider !== "openai" && provider !== "anthropic") {
    return {
      success: false,
      message: `Unsupported provider: ${provider}`,
      latencyMs: null,
      statusCode: null,
      errorType: "unknown",
      errorDetails: `Provider must be "openai" or "anthropic", got "${provider}"`,
      testedAt,
    };
  }

  // Validate baseUrl
  try {
    new URL(baseUrl);
  } catch {
    return {
      success: false,
      message: "Invalid base URL format",
      latencyMs: null,
      statusCode: null,
      errorType: "network",
      errorDetails: `Base URL "${baseUrl}" is not a valid URL`,
      testedAt,
    };
  }

  // Prepare test endpoint and headers based on provider
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const testUrl = `${normalizedBaseUrl}/v1/models`;

  const headers: Record<string, string> = {};

  if (provider === "openai") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (provider === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

  // Start latency measurement
  const startTime = Date.now();

  try {
    // Make test request
    const response = await fetch(testUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Calculate latency
    const latencyMs = Date.now() - startTime;

    // Handle response status codes
    if (response.status === 200 || response.status === 201) {
      // Success
      return {
        success: true,
        message: "Connection successful",
        latencyMs,
        statusCode: response.status,
        testedAt,
      };
    } else if (response.status === 401 || response.status === 403) {
      // Authentication error
      let errorDetails = `HTTP ${response.status}`;
      try {
        const responseText = await response.text();
        if (responseText) {
          errorDetails += `: ${responseText.substring(0, 200)}`;
        }
      } catch {
        // Ignore response body parsing errors
      }

      return {
        success: false,
        message: "Authentication failed - invalid API key",
        latencyMs,
        statusCode: response.status,
        errorType: "authentication",
        errorDetails,
        testedAt,
      };
    } else if (response.status === 404) {
      // Endpoint not found - likely wrong base URL
      return {
        success: false,
        message: "Endpoint not found - check base URL",
        latencyMs,
        statusCode: response.status,
        errorType: "invalid_response",
        errorDetails: `GET ${testUrl} returned 404 - base URL may be incorrect`,
        testedAt,
      };
    } else if (response.status >= 500) {
      // Upstream server error
      let errorDetails = `HTTP ${response.status}`;
      try {
        const responseText = await response.text();
        if (responseText) {
          errorDetails += `: ${responseText.substring(0, 200)}`;
        }
      } catch {
        // Ignore response body parsing errors
      }

      return {
        success: false,
        message: "Upstream server error",
        latencyMs,
        statusCode: response.status,
        errorType: "invalid_response",
        errorDetails,
        testedAt,
      };
    } else {
      // Other unexpected status codes
      return {
        success: false,
        message: `Unexpected response: HTTP ${response.status}`,
        latencyMs,
        statusCode: response.status,
        errorType: "unknown",
        errorDetails: `Received unexpected HTTP status ${response.status}`,
        testedAt,
      };
    }
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle timeout
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        message: `Request timed out after ${timeout} seconds`,
        latencyMs: null,
        statusCode: null,
        errorType: "timeout",
        errorDetails: `Request exceeded ${timeout}s timeout`,
        testedAt,
      };
    }

    // Handle network errors (DNS failure, connection refused, SSL errors, etc.)
    if (error instanceof TypeError) {
      const errorMessage = error.message || "Unknown network error";
      return {
        success: false,
        message: "Network error - could not reach upstream",
        latencyMs: null,
        statusCode: null,
        errorType: "network",
        errorDetails: errorMessage,
        testedAt,
      };
    }

    // Handle unknown errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: "Test failed with unexpected error",
      latencyMs: null,
      statusCode: null,
      errorType: "unknown",
      errorDetails: errorMessage,
      testedAt,
    };
  }
}
