import { desc, eq } from "drizzle-orm";
import { db, cliproxyapiConnections, type CliproxyApiConnection } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/utils/encryption";
import type { CliproxyApiConnectionMode, CliproxyApiConnectionStatus } from "@/types/api";

const MASK_MIN_LENGTH = 7;

export interface CliproxyApiConnectionInput {
  name: string;
  mode: CliproxyApiConnectionMode;
  baseUrl: string;
  clientApiKey?: string | null;
  managementUrl: string;
  managementSecret?: string | null;
  outboundProxyUrl?: string | null;
  isEnabled?: boolean;
  isDefault?: boolean;
}

export interface CliproxyApiConnectionUpdateInput {
  name?: string;
  mode?: CliproxyApiConnectionMode;
  baseUrl?: string;
  clientApiKey?: string | null;
  managementUrl?: string;
  managementSecret?: string | null;
  outboundProxyUrl?: string | null;
  isEnabled?: boolean;
  isDefault?: boolean;
  lastTestedAt?: Date | null;
  lastStatus?: CliproxyApiConnectionStatus | null;
  lastError?: string | null;
}

export interface CliproxyApiConnectionResponse {
  id: string;
  name: string;
  mode: CliproxyApiConnectionMode;
  baseUrl: string;
  clientApiKeyMasked: string | null;
  clientApiKeyConfigured: boolean;
  managementUrl: string;
  managementSecretMasked: string | null;
  managementSecretConfigured: boolean;
  outboundProxyUrl: string | null;
  isEnabled: boolean;
  isDefault: boolean;
  lastTestedAt: Date | null;
  lastStatus: CliproxyApiConnectionStatus;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CliproxyApiConnectionSecrets extends CliproxyApiConnectionResponse {
  clientApiKey: string | null;
  managementSecret: string | null;
}

/**
 * Error raised when a saved CLIProxyAPI connection cannot be found.
 */
export class CliproxyApiConnectionNotFoundError extends Error {
  constructor(id: string) {
    super(`CLIProxyAPI connection not found: ${id}`);
    this.name = "CliproxyApiConnectionNotFoundError";
  }
}

/**
 * Mask a CLIProxyAPI secret while keeping enough edge characters for recognition.
 */
export function maskCliproxyApiSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= MASK_MIN_LENGTH) return "***";
  return `${value.slice(0, 2)}***${value.slice(-4)}`;
}

function normalizeMode(mode: string): CliproxyApiConnectionMode {
  return mode === "managed_sidecar" ? "managed_sidecar" : "external";
}

function normalizeStatus(status: string | null | undefined): CliproxyApiConnectionStatus {
  if (status === "success" || status === "failed") return status;
  return "untested";
}

function normalizeOptionalUrl(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeRequiredUrl(value: string, fieldName: string): string {
  const normalized = value.trim();
  try {
    return new URL(normalized).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${fieldName} must be a valid URL`);
  }
}

function decryptOptionalSecret(value: string | null): string | null {
  return value ? decrypt(value) : null;
}

function mapConnectionRecord(record: CliproxyApiConnection): CliproxyApiConnectionResponse {
  const clientApiKey = decryptOptionalSecret(record.clientApiKeyEncrypted);
  const managementSecret = decryptOptionalSecret(record.managementSecretEncrypted);

  return {
    id: record.id,
    name: record.name,
    mode: normalizeMode(record.mode),
    baseUrl: record.baseUrl,
    clientApiKeyMasked: maskCliproxyApiSecret(clientApiKey),
    clientApiKeyConfigured: Boolean(clientApiKey),
    managementUrl: record.managementUrl,
    managementSecretMasked: maskCliproxyApiSecret(managementSecret),
    managementSecretConfigured: Boolean(managementSecret),
    outboundProxyUrl: record.outboundProxyUrl ?? null,
    isEnabled: record.isEnabled,
    isDefault: record.isDefault,
    lastTestedAt: record.lastTestedAt ?? null,
    lastStatus: normalizeStatus(record.lastStatus),
    lastError: record.lastError ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapConnectionRecordWithSecrets(
  record: CliproxyApiConnection
): CliproxyApiConnectionSecrets {
  const clientApiKey = decryptOptionalSecret(record.clientApiKeyEncrypted);
  const managementSecret = decryptOptionalSecret(record.managementSecretEncrypted);

  return {
    ...mapConnectionRecord(record),
    clientApiKey,
    managementSecret,
  };
}

async function clearDefaultConnection(): Promise<void> {
  await db
    .update(cliproxyapiConnections)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(cliproxyapiConnections.isDefault, true));
}

/**
 * List saved CLIProxyAPI connections with masked secrets.
 */
export async function listCliproxyApiConnections(): Promise<CliproxyApiConnectionResponse[]> {
  const rows = await db.query.cliproxyapiConnections.findMany({
    orderBy: [desc(cliproxyapiConnections.isDefault), desc(cliproxyapiConnections.createdAt)],
  });
  return rows.map(mapConnectionRecord);
}

/**
 * Read one CLIProxyAPI connection with masked secrets.
 */
export async function getCliproxyApiConnection(
  id: string
): Promise<CliproxyApiConnectionResponse | null> {
  const row = await db.query.cliproxyapiConnections.findFirst({
    where: eq(cliproxyapiConnections.id, id),
  });
  return row ? mapConnectionRecord(row) : null;
}

/**
 * Read one CLIProxyAPI connection with decrypted secrets for server-side client calls.
 */
export async function getCliproxyApiConnectionWithSecrets(
  id: string
): Promise<CliproxyApiConnectionSecrets> {
  const row = await db.query.cliproxyapiConnections.findFirst({
    where: eq(cliproxyapiConnections.id, id),
  });
  if (!row) throw new CliproxyApiConnectionNotFoundError(id);
  return mapConnectionRecordWithSecrets(row);
}

/**
 * Read the default CLIProxyAPI connection if one is configured.
 */
export async function getDefaultCliproxyApiConnection(): Promise<CliproxyApiConnectionResponse | null> {
  const row = await db.query.cliproxyapiConnections.findFirst({
    where: eq(cliproxyapiConnections.isDefault, true),
  });
  return row ? mapConnectionRecord(row) : null;
}

/**
 * Create a CLIProxyAPI connection and encrypt any provided secrets before persistence.
 */
export async function createCliproxyApiConnection(
  input: CliproxyApiConnectionInput
): Promise<CliproxyApiConnectionResponse> {
  if (input.isDefault) await clearDefaultConnection();

  const now = new Date();
  const [created] = await db
    .insert(cliproxyapiConnections)
    .values({
      name: input.name.trim(),
      mode: input.mode,
      baseUrl: normalizeRequiredUrl(input.baseUrl, "base_url"),
      clientApiKeyEncrypted: input.clientApiKey ? encrypt(input.clientApiKey) : null,
      managementUrl: normalizeRequiredUrl(input.managementUrl, "management_url"),
      managementSecretEncrypted: input.managementSecret ? encrypt(input.managementSecret) : null,
      outboundProxyUrl: normalizeOptionalUrl(input.outboundProxyUrl),
      isEnabled: input.isEnabled ?? true,
      isDefault: input.isDefault ?? false,
      lastStatus: "untested",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return mapConnectionRecord(created);
}

/**
 * Update a CLIProxyAPI connection while preserving omitted secret fields.
 */
export async function updateCliproxyApiConnection(
  id: string,
  input: CliproxyApiConnectionUpdateInput
): Promise<CliproxyApiConnectionResponse> {
  const existing = await db.query.cliproxyapiConnections.findFirst({
    where: eq(cliproxyapiConnections.id, id),
  });
  if (!existing) throw new CliproxyApiConnectionNotFoundError(id);
  if (input.isDefault) await clearDefaultConnection();

  const updateValues: Partial<typeof cliproxyapiConnections.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) updateValues.name = input.name.trim();
  if (input.mode !== undefined) updateValues.mode = input.mode;
  if (input.baseUrl !== undefined) {
    updateValues.baseUrl = normalizeRequiredUrl(input.baseUrl, "base_url");
  }
  if (input.clientApiKey !== undefined) {
    updateValues.clientApiKeyEncrypted = input.clientApiKey ? encrypt(input.clientApiKey) : null;
  }
  if (input.managementUrl !== undefined) {
    updateValues.managementUrl = normalizeRequiredUrl(input.managementUrl, "management_url");
  }
  if (input.managementSecret !== undefined) {
    updateValues.managementSecretEncrypted = input.managementSecret
      ? encrypt(input.managementSecret)
      : null;
  }
  if (input.outboundProxyUrl !== undefined) {
    updateValues.outboundProxyUrl = normalizeOptionalUrl(input.outboundProxyUrl);
  }
  if (input.isEnabled !== undefined) updateValues.isEnabled = input.isEnabled;
  if (input.isDefault !== undefined) updateValues.isDefault = input.isDefault;
  if (input.lastTestedAt !== undefined) updateValues.lastTestedAt = input.lastTestedAt;
  if (input.lastStatus !== undefined) updateValues.lastStatus = input.lastStatus;
  if (input.lastError !== undefined) updateValues.lastError = input.lastError;

  const [updated] = await db
    .update(cliproxyapiConnections)
    .set(updateValues)
    .where(eq(cliproxyapiConnections.id, id))
    .returning();

  return mapConnectionRecord(updated);
}

/**
 * Delete a saved CLIProxyAPI connection.
 */
export async function deleteCliproxyApiConnection(id: string): Promise<void> {
  const existing = await db.query.cliproxyapiConnections.findFirst({
    where: eq(cliproxyapiConnections.id, id),
  });
  if (!existing) throw new CliproxyApiConnectionNotFoundError(id);
  await db.delete(cliproxyapiConnections).where(eq(cliproxyapiConnections.id, id));
}
