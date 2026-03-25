import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DRIZZLE_DIR = path.join(ROOT, "drizzle");
const DRIZZLE_META_DIR = path.join(DRIZZLE_DIR, "meta");
const JOURNAL_PATH = path.join(DRIZZLE_META_DIR, "_journal.json");

function runCommand(command, args) {
  const env = {
    ...process.env,
    DB_TYPE: process.env.DB_TYPE || "postgres",
    DATABASE_URL:
      process.env.DATABASE_URL || "postgresql://autorouter:autorouter@127.0.0.1:5432/autorouter",
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || "ci-admin-token",
  };

  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].join(" "), { stdio: "inherit", env, shell: true })
      : spawnSync(command, args, { stdio: "inherit", env });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readTextCommand(command, args) {
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].join(" "), {
          stdio: ["ignore", "pipe", "inherit"],
          encoding: "utf8",
          shell: true,
        })
      : spawnSync(command, args, {
          stdio: ["ignore", "pipe", "inherit"],
          encoding: "utf8",
        });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function assertJournalEntriesHaveSqlFiles() {
  if (!existsSync(JOURNAL_PATH)) {
    console.error(`Missing Drizzle journal file: ${path.relative(ROOT, JOURNAL_PATH)}`);
    process.exit(1);
  }

  const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8"));
  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  const missingSql = sorted(
    entries
      .map((entry) => `${entry.tag}.sql`)
      .filter((sqlFile) => !existsSync(path.join(DRIZZLE_DIR, sqlFile)))
  );

  if (missingSql.length > 0) {
    console.error("Drizzle journal references missing SQL migration files:");
    for (const file of missingSql) {
      console.error(`- ${file}`);
    }
    process.exit(1);
  }
}

function assertNoGeneratedDiff() {
  const status = readTextCommand("git", ["status", "--porcelain", "--", "drizzle"]);
  if (!status) {
    return;
  }

  console.error("Detected uncommitted changes in drizzle artifacts after generation:");
  for (const line of status.split("\n")) {
    console.error(`- ${line}`);
  }
  console.error("Run `pnpm db:generate`, review the changes, and commit updated drizzle files.");
  process.exit(1);
}

function main() {
  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

  console.log("Generating Drizzle migrations for consistency validation...");
  runCommand(pnpmCommand, ["db:generate"]);

  console.log("Checking drizzle/meta journal SQL references...");
  assertJournalEntriesHaveSqlFiles();

  console.log("Checking for uncommitted drizzle changes after generation...");
  assertNoGeneratedDiff();

  console.log("Drizzle migration artifacts are consistent.");
}

main();
