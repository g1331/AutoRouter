import { createClient } from "@libsql/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "drizzle-sqlite");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || "./data/dev.sqlite";

function resolveSqliteUrl(dbPath) {
  return dbPath.startsWith("file:") ? dbPath : `file:${dbPath}`;
}

function readMigrationEntries() {
  if (!existsSync(JOURNAL_PATH)) {
    throw new Error(`Missing SQLite journal file: ${path.relative(ROOT, JOURNAL_PATH)}`);
  }

  const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8"));
  return Array.isArray(journal.entries) ? journal.entries : [];
}

function splitStatements(content) {
  return content
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function ensureMigrationsTable(client) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);
}

async function getAppliedHashes(client) {
  const result = await client.execute("SELECT hash FROM __drizzle_migrations");
  return new Set((result.rows ?? []).map((row) => String(row.hash)));
}

function isIgnorableSqliteMigrationError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("already exists") || message.includes("duplicate column name");
}

async function applyMigration(client, hash, sqlContent) {
  const statements = splitStatements(sqlContent);
  if (statements.length === 0) {
    return false;
  }

  await client.execute("BEGIN");
  try {
    for (const statement of statements) {
      try {
        await client.execute(statement);
      } catch (error) {
        if (isIgnorableSqliteMigrationError(error)) {
          continue;
        }
        throw error;
      }
    }
    await client.execute({
      sql: "INSERT INTO __drizzle_migrations (hash) VALUES (?)",
      args: [hash],
    });
    await client.execute("COMMIT");
    return true;
  } catch (error) {
    await client.execute("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function main() {
  if (!existsSync(MIGRATIONS_DIR)) {
    console.log("SQLite migrations directory is missing, skipping.");
    return;
  }

  const client = createClient({
    url: resolveSqliteUrl(SQLITE_DB_PATH),
  });

  try {
    await ensureMigrationsTable(client);
    const appliedHashes = await getAppliedHashes(client);
    const entries = readMigrationEntries();
    let appliedCount = 0;

    for (const entry of entries) {
      const hash = entry.tag;
      const migrationPath = path.join(MIGRATIONS_DIR, `${hash}.sql`);

      if (!existsSync(migrationPath)) {
        throw new Error(`Missing SQLite migration file: ${path.relative(ROOT, migrationPath)}`);
      }

      if (appliedHashes.has(hash)) {
        continue;
      }

      const sqlContent = readFileSync(migrationPath, "utf8");
      const didApply = await applyMigration(client, hash, sqlContent);
      if (didApply) {
        appliedHashes.add(hash);
        appliedCount += 1;
      }
    }

    console.log(`Applied ${appliedCount} migration(s)`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
