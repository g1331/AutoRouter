import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("个人部署保留可选 sidecar", () => {
  it("主 Compose 升级不清理未包含在主文件中的容器", () => {
    const workflow = readFileSync(
      resolve(__dirname, "../../../.github/workflows/deploy-personal.yml"),
      "utf8"
    );
    const deployScript = workflow
      .split("- name: Deploy via SSH")[1]
      ?.split("- name: Verify deployment")[0];
    expect(deployScript).toBeTruthy();
    expect(deployScript).toMatch(/docker compose up -d\s*$/m);
    expect(deployScript).not.toContain("--remove-orphans");
    expect(deployScript).not.toMatch(/docker compose down|docker (?:container )?(?:rm|prune)/);
  });
});
