import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client/sqlite3";

const cleanupPaths = new Set<string>();

async function removeFileWithRetry(filePath: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true });
      }
      return;
    } catch {
      if (attempt === 9) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

async function queryRows<T extends Record<string, unknown>>(
  dbPath: string,
  sql: string
): Promise<T[]> {
  const client = createClient({ url: `file:${dbPath}` });

  try {
    const result = await client.execute(sql);
    return (result.rows ?? []) as T[];
  } finally {
    await client.close();
  }
}

async function bootstrapLegacyUpstreamsTable(dbPath: string): Promise<void> {
  const client = createClient({ url: `file:${dbPath}` });

  try {
    await client.execute(`
      CREATE TABLE upstreams (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        base_url text NOT NULL,
        api_key_encrypted text NOT NULL,
        is_default integer DEFAULT false NOT NULL,
        timeout integer DEFAULT 60 NOT NULL,
        is_active integer DEFAULT true NOT NULL,
        config text,
        weight integer DEFAULT 1 NOT NULL,
        priority integer DEFAULT 0 NOT NULL,
        route_capabilities text,
        allowed_models text,
        model_redirects text,
        affinity_migration text,
        billing_input_multiplier real DEFAULT 1 NOT NULL,
        billing_output_multiplier real DEFAULT 1 NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      )
    `);
  } finally {
    await client.close();
  }
}

afterEach(async () => {
  for (const filePath of cleanupPaths) {
    await removeFileWithRetry(filePath);
    await removeFileWithRetry(`${filePath}-shm`);
    await removeFileWithRetry(`${filePath}-wal`);
    await removeFileWithRetry(`${filePath}-journal`);
  }
  cleanupPaths.clear();
});

describe("db:migrate:sqlite", () => {
  it("should adopt existing sqlite databases with empty migration history and apply pending schema changes", async () => {
    const dbPath = path.join(tmpdir(), `autorouter-test-migrate-${randomUUID()}.sqlite`);
    cleanupPaths.add(dbPath);

    await bootstrapLegacyUpstreamsTable(dbPath);

    const firstRun = spawnSync(process.execPath, ["scripts/db/migrate-sqlite.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SQLITE_DB_PATH: dbPath,
      },
      encoding: "utf8",
      timeout: 30_000,
    });

    expect(firstRun.status).toBe(0);
    expect(firstRun.stdout).toContain("Applied 14 migration(s)");

    const migrations = await queryRows<{ hash: string }>(
      dbPath,
      "SELECT hash FROM __drizzle_migrations ORDER BY id"
    );
    expect(migrations.map((row) => row.hash)).toEqual([
      "0000_broken_post",
      "0001_known_prima",
      "0002_api_keys_access_mode",
      "0003_medical_rattler",
      "0004_simple_donald_blake",
      "0005_cloudy_mesmero",
      "0006_dapper_bucky",
      "0007_rare_psynapse",
      "0008_cloudy_photon",
      "0009_numerous_night_thrasher",
      "0010_confused_mister_fear",
      "0011_lush_kitty_pryde",
      "0012_tense_chimera",
      "0013_daily_white_tiger",
    ]);

    const upstreamColumns = await queryRows<{ name: string }>(
      dbPath,
      "PRAGMA table_info('upstreams')"
    );
    expect(upstreamColumns.map((row) => row.name)).toContain("model_discovery");
    expect(upstreamColumns.map((row) => row.name)).toContain("model_rules");
    expect(upstreamColumns.map((row) => row.name)).toContain("queue_policy");
    expect(upstreamColumns.map((row) => row.name)).toContain("failure_rule_config");

    const failureRuleColumns = await queryRows<{ name: string }>(
      dbPath,
      "PRAGMA table_info('upstream_failure_rules')"
    );
    expect(failureRuleColumns.map((row) => row.name)).toEqual(
      expect.arrayContaining(["id", "upstream_id", "name", "enabled", "priority", "match"])
    );

    const apiKeyColumns = await queryRows<{ name: string }>(
      dbPath,
      "PRAGMA table_info('api_keys')"
    );
    expect(apiKeyColumns.map((row) => row.name)).toContain("allowed_models");

    const probeColumns = await queryRows<{ name: string }>(
      dbPath,
      "PRAGMA table_info('upstream_probe_results')"
    );
    expect(probeColumns.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "upstream_id",
        "route_capability",
        "client_profile",
        "probe_template_id",
        "status",
        "latency_ms",
        "response_body",
        "checked_at",
      ])
    );

    const probeIndexes = await queryRows<{ name: string; unique: number }>(
      dbPath,
      "PRAGMA index_list('upstream_probe_results')"
    );
    expect(probeIndexes.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "upstream_probe_results_identity_unique",
        "upstream_probe_results_upstream_id_idx",
        "upstream_probe_results_status_idx",
        "upstream_probe_results_checked_at_idx",
      ])
    );
    expect(
      probeIndexes.find((row) => row.name === "upstream_probe_results_identity_unique")?.unique
    ).toBe(1);

    const secondRun = spawnSync(process.execPath, ["scripts/db/migrate-sqlite.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SQLITE_DB_PATH: dbPath,
      },
      encoding: "utf8",
      timeout: 30_000,
    });

    expect(secondRun.status).toBe(0);
    expect(secondRun.stdout).toContain("Applied 0 migration(s)");
  });
});
