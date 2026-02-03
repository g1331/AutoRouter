import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import postgres, { type Sql } from "postgres";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { config } from "../utils/config";

type DbType = "postgres" | "sqlite";
type DatabaseInstance = PostgresJsDatabase<typeof schema>;

// Lazy-loaded database client (avoids errors at build time)
let client: Sql | null = null;
let sqliteClient: Database.Database | null = null;
let dbInstance: DatabaseInstance | null = null;
let dbType: DbType | null = null;

function ensureDbType(): DbType {
  if (!dbType) {
    dbType = config.dbType;
  }
  return dbType;
}

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

function getSqliteClient(): Database.Database {
  if (!sqliteClient) {
    sqliteClient = new Database(config.sqliteDbPath);
  }
  return sqliteClient;
}

function getDb(): DatabaseInstance {
  if (!dbInstance) {
    if (ensureDbType() === "sqlite") {
      dbInstance = drizzleSqlite(getSqliteClient(), { schema }) as unknown as DatabaseInstance;
    } else {
      dbInstance = drizzlePg(getClient(), { schema });
    }
  }
  return dbInstance;
}

// Export a proxy that lazily initializes the database
export const db = new Proxy({} as DatabaseInstance, {
  get(_, prop) {
    return Reflect.get(getDb(), prop);
  },
});

// Export schema for convenience
export * from "./schema";

// Graceful shutdown helper
export async function closeDatabase(): Promise<void> {
  if (sqliteClient) {
    sqliteClient.close();
    sqliteClient = null;
  }

  if (client) {
    await client.end();
    client = null;
  }
  dbInstance = null;
  dbType = null;
}
