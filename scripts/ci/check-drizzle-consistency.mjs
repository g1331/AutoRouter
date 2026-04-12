import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATION_TARGETS = [
  {
    label: "PostgreSQL",
    directory: "drizzle",
    generateScript: "db:generate",
  },
  {
    label: "SQLite",
    directory: "drizzle-sqlite",
    generateScript: "db:generate:sqlite",
  },
];

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

function assertJournalEntriesHaveSqlFiles(target) {
  const drizzleDir = path.join(ROOT, target.directory);
  const journalPath = path.join(drizzleDir, "meta", "_journal.json");

  if (!existsSync(journalPath)) {
    console.error(
      `Missing ${target.label} Drizzle journal file: ${path.relative(ROOT, journalPath)}`
    );
    process.exit(1);
  }

  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  const missingSql = sorted(
    entries
      .map((entry) => `${entry.tag}.sql`)
      .filter((sqlFile) => !existsSync(path.join(drizzleDir, sqlFile)))
  );

  if (missingSql.length > 0) {
    console.error(`${target.label} Drizzle journal references missing SQL migration files:`);
    for (const file of missingSql) {
      console.error(`- ${file}`);
    }
    process.exit(1);
  }
}

function assertNoGeneratedDiff(target) {
  const status = readTextCommand("git", ["status", "--porcelain", "--", target.directory]);
  if (!status) {
    return;
  }

  console.error(
    `Detected uncommitted changes in ${target.label} drizzle artifacts after generation:`
  );
  for (const line of status.split("\n")) {
    console.error(`- ${line}`);
  }
  console.error(
    `Run \`pnpm ${target.generateScript}\`, review the changes, and commit updated ${target.directory} files.`
  );
  process.exit(1);
}

function main() {
  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

  for (const target of MIGRATION_TARGETS) {
    console.log(`Generating ${target.label} Drizzle migrations for consistency validation...`);
    runCommand(pnpmCommand, [target.generateScript]);

    console.log(`Checking ${target.directory}/meta journal SQL references...`);
    assertJournalEntriesHaveSqlFiles(target);

    console.log(`Checking for uncommitted ${target.label} drizzle changes after generation...`);
    assertNoGeneratedDiff(target);
  }

  console.log("Drizzle migration artifacts are consistent.");
}

main();
