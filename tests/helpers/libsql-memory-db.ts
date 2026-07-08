import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { is } from "drizzle-orm";
import { SQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import fs from "fs";
import path from "path";
import * as schema from "@/lib/db/schema-sqlite";

/**
 * Build the `@/lib/db` module shape backed by a real libsql in-memory
 * database, for use inside `vi.mock("@/lib/db", ...)` factories:
 *
 *   vi.mock("@/lib/db", async () => {
 *     const { createLibsqlMemoryDbModule } = await import("../../helpers/libsql-memory-db");
 *     return createLibsqlMemoryDbModule();
 *   });
 *
 * Notes on the harness:
 * - A bare ":memory:" libsql database is scoped to a single connection, so
 *   the migration connection and drizzle's query connection would see
 *   different empty databases. The shared-cache in-memory URI gives every
 *   connection in the process the same backing store while staying file-free.
 *   (vitest isolates test files into separate workers, so test files never
 *   share this store with each other.)
 * - Migrations are applied statement by statement: drizzle's own libsql
 *   migrator batches every fragment including the empty pieces left by
 *   `--> statement-breakpoint` splitting, which makes libsql raise a
 *   spurious "not an error".
 * - The drizzle-sqlite migrations have drifted from schema-sqlite: some
 *   columns are recorded in the snapshot metadata but no .sql migration ever
 *   adds them, and some tables are never created at all. Reconcile every
 *   migrated table by adding missing columns (nullable, which is enough to
 *   insert and read rows in tests) and skip tables the migrations never
 *   created.
 */
export async function createLibsqlMemoryDbModule() {
  const client = createClient({ url: "file::memory:?cache=shared" });

  const dir = path.resolve(process.cwd(), "drizzle-sqlite");
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await client.execute(stmt);
    }
  }

  for (const exported of Object.values(schema)) {
    if (!is(exported, SQLiteTable)) {
      continue;
    }
    const cfg = getTableConfig(exported);
    const info = await client.execute(`PRAGMA table_info(\`${cfg.name}\`)`);
    if (info.rows.length === 0) {
      continue;
    }
    const existing = new Set(info.rows.map((row) => String(row.name)));
    for (const column of cfg.columns) {
      if (!existing.has(column.name)) {
        await client.execute(
          `ALTER TABLE \`${cfg.name}\` ADD COLUMN \`${column.name}\` ${column.getSQLType()}`
        );
      }
    }
  }

  const db = drizzle(client, { schema });
  return { db, ...schema };
}
