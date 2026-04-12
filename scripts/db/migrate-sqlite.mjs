import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@libsql/client";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(CURRENT_DIR, "..", "..");
const DEFAULT_SQLITE_DB_PATH = "./data/dev.sqlite";
const MIGRATIONS_DIR = path.join(ROOT_DIR, "drizzle-sqlite");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

function resolveSqliteUrl() {
  const configuredPath = process.env.SQLITE_DB_PATH || DEFAULT_SQLITE_DB_PATH;
  return configuredPath.startsWith("file:") ? configuredPath : `file:${configuredPath}`;
}

function splitStatements(sqlContent) {
  return sqlContent
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function computeMigrationHash(sqlContent) {
  return createHash("sha256").update(sqlContent).digest("hex");
}

function readJournalEntries() {
  if (!existsSync(JOURNAL_PATH)) {
    throw new Error(`Missing SQLite migration journal: ${path.relative(ROOT_DIR, JOURNAL_PATH)}`);
  }

  const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8"));
  if (journal.dialect !== "sqlite") {
    throw new Error(`Unexpected SQLite journal dialect: ${String(journal.dialect)}`);
  }

  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  return entries
    .map((entry) => ({
      idx: Number(entry.idx),
      when: Number(entry.when),
      tag: String(entry.tag),
    }))
    .sort((left, right) => left.idx - right.idx);
}

function isSafeToSkipStatementError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("duplicate column name:") ||
    message.includes("already exists") ||
    message.includes("duplicate key")
  );
}

async function ensureMigrationsTable(client) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      created_at NUMERIC
    )
  `);
}

async function readAppliedMigrationHashes(client) {
  const result = await client.execute("SELECT hash FROM __drizzle_migrations");
  return new Set(result.rows.map((row) => String(row.hash)));
}

async function applyMigration(client, entry, appliedHashes) {
  const migrationPath = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
  if (!existsSync(migrationPath)) {
    throw new Error(`Missing SQLite migration SQL: ${path.relative(ROOT_DIR, migrationPath)}`);
  }

  const sqlContent = readFileSync(migrationPath, "utf8");
  const migrationHash = computeMigrationHash(sqlContent);

  if (appliedHashes.has(migrationHash)) {
    console.log(`[sqlite-migrate] Skip already applied: ${entry.tag}`);
    return false;
  }

  const statements = splitStatements(sqlContent);
  const transaction = await client.transaction("write");
  let committed = false;

  try {
    for (const statement of statements) {
      try {
        await transaction.executeMultiple(statement);
      } catch (error) {
        if (isSafeToSkipStatementError(error)) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            `[sqlite-migrate] Statement already satisfied for ${entry.tag}, continue: ${message}`
          );
          continue;
        }

        throw error;
      }
    }

    await transaction.execute({
      sql: "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
      args: [migrationHash, entry.when],
    });
    await transaction.commit();
    committed = true;
    appliedHashes.add(migrationHash);
    console.log(`[sqlite-migrate] Applied: ${entry.tag}`);
    return true;
  } catch (error) {
    if (!committed) {
      try {
        await transaction.rollback();
      } catch {
        // Ignore rollback errors so the original failure is preserved.
      }
    }
    throw error;
  } finally {
    transaction.close();
  }
}

async function main() {
  const client = createClient({ url: resolveSqliteUrl() });
  const journalEntries = readJournalEntries();

  try {
    await ensureMigrationsTable(client);
    const appliedHashes = await readAppliedMigrationHashes(client);

    let appliedCount = 0;
    for (const entry of journalEntries) {
      const applied = await applyMigration(client, entry, appliedHashes);
      if (applied) {
        appliedCount += 1;
      }
    }

    console.log(`[sqlite-migrate] Completed. Applied ${appliedCount} migration(s).`);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error("[sqlite-migrate] Failed:", error);
  process.exit(1);
});
