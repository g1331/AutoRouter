import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

// Lazy-loaded database client (avoids errors at build time)
let client: Sql | null = null;
let dbInstance: PostgresJsDatabase<typeof schema> | null = null;

function getClient(): Sql {
  if (!client) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    client = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return client;
}

function getDb(): PostgresJsDatabase<typeof schema> {
  if (!dbInstance) {
    dbInstance = drizzle(getClient(), { schema });
  }
  return dbInstance;
}

// Export a proxy that lazily initializes the database
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_, prop) {
    return Reflect.get(getDb(), prop);
  },
});

// Export schema for convenience
export * from "./schema";

// Graceful shutdown helper
export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
    dbInstance = null;
  }
}
