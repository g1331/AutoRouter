import { z } from "zod";

/**
 * Application configuration schema with validation.
 */
const configSchema = z
  .object({
    // Environment
    environment: z.enum(["development", "production", "test"]).default("development"),
    nodeEnv: z.string().default("development"),

    // Database
    dbType: z.enum(["postgres", "sqlite"]).default("postgres"),
    sqliteDbPath: z.string().default("./data/dev.sqlite"),

    // Database (required at runtime, optional at build time)
    databaseUrl: z.string().optional(),

    // Server
    port: z.coerce.number().int().positive().default(3000),

    // Security
    encryptionKey: z.string().min(44).max(44).optional(), // Fernet key is 44 chars base64
    encryptionKeyFile: z.string().optional(),
    adminToken: z.string().min(1).optional(),

    // Logging
    logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional(),

    // Features
    allowKeyReveal: z.coerce.boolean().default(false),
    debugLogHeaders: z.coerce.boolean().default(false),

    // Request log retention
    logRetentionDays: z.coerce.number().int().positive().default(90),

    // Health check
    healthCheckInterval: z.coerce.number().int().positive().default(30),
    healthCheckTimeout: z.coerce.number().int().positive().default(10),

    // CORS
    corsOrigins: z
      .string()
      .optional()
      .transform((s) => (s ? s.split(",").map((o) => o.trim()) : ["http://localhost:3000"])),
  })
  .superRefine((value, ctx) => {
    if (value.dbType === "postgres" && value.databaseUrl) {
      if (
        !value.databaseUrl.startsWith("postgres://") &&
        !value.databaseUrl.startsWith("postgresql://")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "DATABASE_URL must be a valid PostgreSQL connection string",
          path: ["databaseUrl"],
        });
      }
    }
  });

export type Config = z.infer<typeof configSchema>;

/**
 * Load and validate configuration from environment variables.
 */
function loadConfig(): Config {
  const rawConfig = {
    environment: process.env.ENVIRONMENT || process.env.NODE_ENV,
    nodeEnv: process.env.NODE_ENV,
    dbType: process.env.DB_TYPE ?? (process.env.DATABASE_URL ? "postgres" : "sqlite"),
    sqliteDbPath: process.env.SQLITE_DB_PATH,
    databaseUrl: process.env.DATABASE_URL,
    port: process.env.PORT,
    encryptionKey: process.env.ENCRYPTION_KEY,
    encryptionKeyFile: process.env.ENCRYPTION_KEY_FILE,
    adminToken: process.env.ADMIN_TOKEN,
    logLevel: process.env.LOG_LEVEL,
    allowKeyReveal: process.env.ALLOW_KEY_REVEAL,
    debugLogHeaders: process.env.DEBUG_LOG_HEADERS,
    logRetentionDays: process.env.LOG_RETENTION_DAYS,
    healthCheckInterval: process.env.HEALTH_CHECK_INTERVAL,
    healthCheckTimeout: process.env.HEALTH_CHECK_TIMEOUT,
    corsOrigins: process.env.CORS_ORIGINS,
  };

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.issues
      .map((e) => `  - ${String(e.path.join("."))}: ${e.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  // Fail-fast: production must not silently fall back to SQLite
  if (
    result.data.environment === "production" &&
    !process.env.DB_TYPE &&
    !process.env.DATABASE_URL
  ) {
    throw new Error(
      "DATABASE_URL is required in production. Set DATABASE_URL or explicitly set DB_TYPE."
    );
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
