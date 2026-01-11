import { eq, desc, count } from "drizzle-orm";
import { db, upstreams, type Upstream } from "../db";
import { encrypt, decrypt } from "../utils/encryption";
import * as dns from "dns";

const MIN_KEY_LENGTH_FOR_MASKING = 7;

/**
 * Validates an IP address to prevent SSRF attacks.
 * Blocks private IPs, loopback addresses, link-local addresses, and cloud metadata endpoints.
 */
function isIpSafe(ip: string): { safe: boolean; reason?: string } {
  // Block loopback addresses
  if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("127.")) {
    return { safe: false, reason: "Loopback addresses are not allowed" };
  }

  // Check IPv4
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = ip.match(ipv4Regex);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    // Validate octets are in valid range 0-255
    if (a > 255 || b > 255 || c > 255 || d > 255) {
      return { safe: false, reason: "Invalid IP format" };
    }
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      return { safe: false, reason: "Private IP addresses are not allowed" };
    }
    // Link-local 169.254.0.0/16 (AWS metadata)
    if (a === 169 && b === 254) {
      return {
        safe: false,
        reason: "Link-local addresses (cloud metadata endpoints) are not allowed",
      };
    }
    return { safe: true };
  }

  // Check IPv6
  if (ip.includes(":")) {
    const lowerIp = ip.toLowerCase();
    // Block fc00::/7 (unique local addresses)
    if (lowerIp.startsWith("fc") || lowerIp.startsWith("fd")) {
      return { safe: false, reason: "IPv6 private addresses are not allowed" };
    }
    // Block fe80::/10 (link-local)
    if (lowerIp.startsWith("fe80")) {
      return { safe: false, reason: "IPv6 link-local addresses are not allowed" };
    }
    // Block ff00::/8 (multicast)
    if (lowerIp.startsWith("ff")) {
      return { safe: false, reason: "IPv6 multicast addresses are not allowed" };
    }
    // Block IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
    if (lowerIp.includes("::ffff:")) {
      return { safe: false, reason: "IPv4-mapped IPv6 addresses are not allowed" };
    }
    // Block IPv4-compatible IPv6 addresses (::x.x.x.x)
    if (lowerIp.match(/^::[\d.]+$/)) {
      return { safe: false, reason: "IPv4-compatible IPv6 addresses are not allowed" };
    }
    return { safe: true };
  }

  return { safe: true };
}

/**
 * Validates a URL to prevent SSRF attacks.
 * Blocks private IPs, loopback addresses, link-local addresses, and cloud metadata endpoints.
 */
function isUrlSafe(urlString: string): { safe: boolean; reason?: string } {
  try {
    const url = new URL(urlString);

    // Only allow http and https
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { safe: false, reason: "Only HTTP and HTTPS protocols are allowed" };
    }

    const hostname = url.hostname.toLowerCase();

    // Block localhost
    if (hostname === "localhost") {
      return { safe: false, reason: "Loopback addresses are not allowed" };
    }

    // If hostname looks like an IP address, validate it
    if (hostname.match(/^[\d.:]+$/)) {
      return isIpSafe(hostname);
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: "Invalid URL format" };
  }
}

/**
 * Resolves a hostname to IP addresses and validates all IPs to prevent DNS rebinding attacks.
 */
async function resolveAndValidateHostname(
  hostname: string
): Promise<{ safe: boolean; reason?: string }> {
  try {
    // Resolve both IPv4 and IPv6 addresses
    const addresses: string[] = [];

    try {
      const ipv4Addresses = await dns.promises.resolve4(hostname);
      addresses.push(...ipv4Addresses);
    } catch {
      // IPv4 resolution may fail if only IPv6 is available
    }

    try {
      const ipv6Addresses = await dns.promises.resolve6(hostname);
      addresses.push(...ipv6Addresses);
    } catch {
      // IPv6 resolution may fail if only IPv4 is available
    }

    // If no addresses resolved, treat as DNS failure
    if (addresses.length === 0) {
      return { safe: false, reason: "DNS resolution failed" };
    }

    // Validate all resolved IP addresses
    for (const ip of addresses) {
      const ipCheck = isIpSafe(ip);
      if (!ipCheck.safe) {
        return {
          safe: false,
          reason: `Hostname resolves to blocked IP: ${ipCheck.reason}`,
        };
      }
    }

    return { safe: true };
  } catch (error) {
    // DNS resolution errors are treated as unsafe
    return {
      safe: false,
      reason: error instanceof Error ? error.message : "DNS resolution failed",
    };
  }
}

/**
 * Error thrown when an upstream is not found in the database.
 */
export class UpstreamNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamNotFoundError";
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
 * Formats a TestUpstreamResult for API response (converts camelCase to snake_case).
 */
export function formatTestUpstreamResponse(result: TestUpstreamResult) {
  return {
    success: result.success,
    message: result.message,
    latency_ms: result.latencyMs,
    status_code: result.statusCode,
    error_type: result.errorType,
    error_details: result.errorDetails,
    tested_at: result.testedAt.toISOString(),
  };
}

/**
 * Test connection to an upstream provider.
 *
 * Makes a lightweight API call to verify connectivity and authentication by calling
 * the provider's `/v1/models` endpoint. This function does NOT throw errors - all
 * failure scenarios are captured in the returned TestUpstreamResult object.
 *
 * **Supported Providers:**
 * - **OpenAI**: Uses `Authorization: Bearer {apiKey}` header
 * - **Anthropic**: Uses `x-api-key: {apiKey}` and `anthropic-version: 2023-06-01` headers
 *
 * **Test Process:**
 * 1. Validates provider type and base URL format
 * 2. Constructs test endpoint: `{baseUrl}/v1/models`
 * 3. Makes GET request with provider-specific authentication headers
 * 4. Measures response latency and validates status code
 * 5. Returns structured result with success status and diagnostic information
 *
 * **Success Criteria:**
 * - HTTP status 200 or 201 response from the upstream provider
 * - Latency measurement captured in milliseconds
 *
 * **Error Conditions:**
 * - **authentication**: Invalid API key (HTTP 401/403)
 * - **network**: DNS failure, connection refused, SSL errors, or unreachable host
 * - **timeout**: Request exceeds the specified timeout duration
 * - **invalid_response**: Wrong base URL (404), upstream server error (5xx), or unexpected status
 * - **unknown**: Unsupported provider, malformed URL, or unexpected errors
 *
 * @param input - Upstream test configuration
 * @param input.provider - Provider type, must be "openai" or "anthropic"
 * @param input.baseUrl - Base URL of the upstream API (e.g., "https://api.openai.com")
 * @param input.apiKey - API key for authentication (plain text, not encrypted)
 * @param input.timeout - Optional timeout in seconds (defaults to 10, max recommended 300)
 *
 * @returns Test result object containing:
 * - `success`: Boolean indicating if the test passed (true for HTTP 200/201)
 * - `message`: Human-readable status message for display
 * - `latencyMs`: Response time in milliseconds (null if request failed before completion)
 * - `statusCode`: HTTP status code from the response (null if network/timeout error)
 * - `errorType`: Category of error for programmatic handling (only present on failure)
 * - `errorDetails`: Detailed technical error message for debugging (only present on failure)
 * - `testedAt`: Timestamp when the test was performed
 *
 * @example
 * ```typescript
 * // Test a new OpenAI configuration
 * const openAiResult = await testUpstreamConnection({
 *   provider: "openai",
 *   baseUrl: "https://api.openai.com",
 *   apiKey: "sk-proj-...",
 *   timeout: 10
 * });
 *
 * if (openAiResult.success) {
 *   console.log(`✓ Connected in ${openAiResult.latencyMs}ms`);
 * } else {
 *   console.error(`✗ ${openAiResult.message}`);
 *   console.error(`  Error type: ${openAiResult.errorType}`);
 *   console.error(`  Details: ${openAiResult.errorDetails}`);
 * }
 *
 * // Test Anthropic configuration with custom timeout
 * const anthropicResult = await testUpstreamConnection({
 *   provider: "anthropic",
 *   baseUrl: "https://api.anthropic.com",
 *   apiKey: "sk-ant-...",
 *   timeout: 15
 * });
 *
 * // Handle different error types
 * if (!anthropicResult.success) {
 *   switch (anthropicResult.errorType) {
 *     case "authentication":
 *       console.error("Invalid API key - please check credentials");
 *       break;
 *     case "network":
 *       console.error("Network error - check URL and connectivity");
 *       break;
 *     case "timeout":
 *       console.error("Request timed out - try increasing timeout");
 *       break;
 *     default:
 *       console.error("Unexpected error:", anthropicResult.message);
 *   }
 * }
 * ```
 *
 * @see {@link TestUpstreamInput} for input type definition
 * @see {@link TestUpstreamResult} for detailed result structure
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

  // Validate baseUrl format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    return {
      success: false,
      message: "Invalid base URL format",
      latencyMs: null,
      statusCode: null,
      errorType: "unknown",
      errorDetails: `Base URL "${baseUrl}" is not a valid URL`,
      testedAt,
    };
  }

  // Check for SSRF vulnerabilities
  const urlSafetyCheck = isUrlSafe(baseUrl);
  if (!urlSafetyCheck.safe) {
    return {
      success: false,
      message: "Invalid base URL",
      latencyMs: null,
      statusCode: null,
      errorType: "unknown",
      errorDetails: urlSafetyCheck.reason || "Base URL is not allowed",
      testedAt,
    };
  }

  // For domain names (not IPs), resolve DNS and validate all IPs to prevent DNS rebinding
  const hostname = parsedUrl.hostname.toLowerCase();
  const isIpAddress = hostname.match(/^[\d.:]+$/);
  if (!isIpAddress && hostname !== "localhost") {
    const dnsCheck = await resolveAndValidateHostname(hostname);
    if (!dnsCheck.safe) {
      return {
        success: false,
        message: "Invalid base URL",
        latencyMs: null,
        statusCode: null,
        errorType: "unknown",
        errorDetails: dnsCheck.reason || "Hostname resolves to blocked IP address",
        testedAt,
      };
    }
  }

  // Normalize base URL to origin only (prevent path doubling)
  const normalizedBaseUrl = parsedUrl.origin;
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
      redirect: "error", // Prevent redirect-based SSRF attacks
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
