import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const entrypointPath = resolve(__dirname, "../../../scripts/docker-entrypoint.sh");
const compose = readFileSync(resolve(__dirname, "../../../docker-compose.yml"), "utf8");
const dockerfile = readFileSync(resolve(__dirname, "../../../Dockerfile"), "utf8");
const entrypoint = readFileSync(entrypointPath, "utf8");
const autorouterService =
  compose.match(/\n  autorouter:\n([\s\S]*?)(?=\n  [a-zA-Z][\w-]*:\n|\nvolumes:\n)/)?.[1] ?? "";

describe("production traffic recording storage", () => {
  it("defaults fixtures to the persistent application data volume", () => {
    expect(autorouterService).not.toBe("");
    expect(autorouterService).toContain(
      "RECORDER_FIXTURES_DIR=${RECORDER_FIXTURES_DIR:-/app/data/traffic-recordings}"
    );
    expect(autorouterService).toMatch(/-\s+autorouter-data:\/app\/data/);
  });

  it("initializes the mounted data volume for the runtime user", () => {
    const dataInitialization = dockerfile.indexOf(
      "RUN mkdir -p /app/data && chown nextjs:nodejs /app/data"
    );
    const rootUser = dockerfile.indexOf("USER root");

    expect(dataInitialization).toBeGreaterThanOrEqual(0);
    expect(dataInitialization).toBeLessThan(rootUser);
  });

  it("repairs existing volume ownership before starting as nextjs", () => {
    const ownershipRepair = entrypoint.indexOf('chown -R nextjs:nodejs "$DATA_DIR"');
    const migrations = entrypoint.indexOf('su-exec nextjs node -e "');
    const application = entrypoint.indexOf('exec su-exec nextjs "$@"');

    expect(dockerfile).toContain("RUN apk add --no-cache su-exec");
    expect(dockerfile).toContain("USER root");
    expect(ownershipRepair).toBeGreaterThanOrEqual(0);
    expect(migrations).toBeGreaterThan(ownershipRepair);
    expect(application).toBeGreaterThan(migrations);
  });
  it("runs ownership repair, migrations, and app startup in order", () => {
    const repoRoot = resolve(__dirname, "../../..");
    const tempRoot = mkdtempSync(resolve(repoRoot, ".tmp-entrypoint-"));
    const relativeRoot = relative(repoRoot, tempRoot).replaceAll("\\", "/");
    const binRoot = resolve(tempRoot, "bin");
    const logPath = resolve(tempRoot, "calls.log");
    mkdirSync(binRoot, { recursive: true });
    const scriptPath = resolve(tempRoot, "entrypoint.sh");

    try {
      writeFileSync(
        scriptPath,
        entrypoint.replace("DATA_DIR=/app/data", `DATA_DIR=./${relativeRoot}/data`)
      );
      writeFileSync(
        resolve(binRoot, "chown"),
        '#!/bin/sh\nprintf \'%s\\n\' "chown:$*" >> "$ENTRYPOINT_TEST_LOG"\n',
        { mode: 0o755 }
      );
      writeFileSync(
        resolve(binRoot, "su-exec"),
        [
          "#!/bin/sh",
          'printf \'%s\\n\' "su-exec:$1:$2" >> "$ENTRYPOINT_TEST_LOG"',
          '[ "$2" = "node" ] && exit 0',
          '[ "$1" = "nextjs" ] && [ "$2" = "app-smoke" ] && exit 0',
          "exit 1",
          "",
        ].join("\n"),
        { mode: 0o755 }
      );
      chmodSync(resolve(binRoot, "chown"), 0o755);
      chmodSync(resolve(binRoot, "su-exec"), 0o755);

      const pathSeparator = process.platform === "win32" ? ";" : ":";
      execFileSync("sh", [scriptPath, "app-smoke"], {
        cwd: repoRoot,
        env: {
          ...process.env,
          DATABASE_URL: "postgres://entrypoint-test",
          ENTRYPOINT_TEST_LOG: `./${relativeRoot}/calls.log`,
          PATH: `./${relativeRoot}/bin${pathSeparator}${process.env.PATH ?? ""}`,
        },
        stdio: "pipe",
      });

      const calls = readFileSync(logPath, "utf8").trim().split(/\r?\n/);
      expect(calls[0]).toContain("chown:-R nextjs:nodejs");
      expect(calls.slice(1)).toEqual(["su-exec:nextjs:node", "su-exec:nextjs:app-smoke"]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
