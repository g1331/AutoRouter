import { z } from "zod";

/**
 * Application configuration schema with validation.
 */
const configSchema = z.object({
  // Environment
  environment: z.enum(["development", "production", "test"]).default("development"),
  nodeEnv: z.string().default("development"),

  // Database (required at runtime, optional at build time)
  databaseUrl: z
    .string()
    .optional()
    .refine((url) => !url || url.startsWith("postgres://") || url.startsWith("postgresql://"), {
      message: "DATABASE_URL must be a valid PostgreSQL connection string",
    }),

  // Server
  port: z.coerce.number().int().positive().default(3000),

  // Security
  encryptionKey: z.string().min(44).max(44).optional(), // Fernet key is 44 chars base64
  encryptionKeyFile: z.string().optional(),
  adminToken: z.string().min(1).optional(),

  // Features
  allowKeyReveal: z.coerce.boolean().default(false),
  debugLogHeaders: z.coerce.boolean().default(false),

  // Request log retention
  logRetentionDays: z.coerce.number().int().positive().default(90),

  // CORS
  corsOrigins: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((o) => o.trim()) : ["http://localhost:3000"])),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Load and validate configuration from environment variables.
 */
function loadConfig(): Config {
  const rawConfig = {
    environment: process.env.ENVIRONMENT || process.env.NODE_ENV,
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    port: process.env.PORT,
    encryptionKey: process.env.ENCRYPTION_KEY,
    encryptionKeyFile: process.env.ENCRYPTION_KEY_FILE,
    adminToken: process.env.ADMIN_TOKEN,
    allowKeyReveal: process.env.ALLOW_KEY_REVEAL,
    debugLogHeaders: process.env.DEBUG_LOG_HEADERS,
    logRetentionDays: process.env.LOG_RETENTION_DAYS,
    corsOrigins: process.env.CORS_ORIGINS,
  };

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.issues
      .map((e) => `  - ${String(e.path.join("."))}: ${e.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data;
}

// Export singleton config instance
export const config = loadConfig();

/**
 * Check if admin token is configured.
 */
export function isAdminConfigured(): boolean {
  return !!config.adminToken;
}

/**
 * Validate admin token.
 */
export function validateAdminToken(token: string | null): boolean {
  if (!config.adminToken) {
    // If no admin token configured, deny all access
    return false;
  }
  return token === config.adminToken;
}
