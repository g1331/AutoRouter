import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";
import { config } from "../utils/config";

type DbType = "postgres" | "sqlite";

// All business code is written against PG types. SQLite is only for local
// development sandboxing and its drizzle instance is structurally compatible
// at runtime, so we keep the exported type as PostgresJsDatabase.
type DatabaseInstance = PostgresJsDatabase<typeof schema>;

// Lazy-loaded database client (avoids errors at build time)
let client: Sql | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqliteClient: any = null;
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

function getSqliteClient() {
  if (!sqliteClient) {
    // Dynamic require to avoid bundling native module in production builds.
    // better-sqlite3 is a devDependency and not available in production.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    sqliteClient = new Database(config.sqliteDbPath);
  }
  return sqliteClient;
}

function getDb(): DatabaseInstance {
  if (!dbInstance) {
    if (ensureDbType() === "sqlite") {
      // Dynamic require: SQLite drizzle instance is structurally compatible
      // with PG at runtime for standard CRUD operations (select/insert/update/
      // delete/query/transaction). Raw SQL via db.execute() may use PG-specific
      // syntax that won't work on SQLite (e.g. PERCENTILE_CONT).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { drizzle: drizzleSqlite } = require("drizzle-orm/better-sqlite3");
      dbInstance = drizzleSqlite(getSqliteClient(), { schema }) as DatabaseInstance;
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
