// @vitest-environment node
/**
 * 圆角词汇收敛回归锁：全量扫描 src/**\/*.tsx，断言不再出现已废弃的圆角类。
 * 目标词汇仅保留 rounded-cf-sm / rounded-cf-md / rounded-full / rounded-none。
 * 命中失败时，把违规类替换为上述目标词汇，而不是在此放宽断言。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = resolve(__dirname, "../../src");

function collectTsxFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsxFiles(full));
    } else if (entry.isFile() && full.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

// 使用简单的正向字面量模式：负向 lookahead 在部分工具链下会静默漏匹配，
// 这里用前后的类串边界字符（空白/引号/反引号）来锚定独立的 `rounded` 类。
const FORBIDDEN_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "standalone rounded", regex: /[\s"'`]rounded[\s"'`]/ },
  { name: "arbitrary rounded-[…]", regex: /rounded-\[/ },
  { name: "rounded-sm", regex: /rounded-sm\b/ },
  { name: "rounded-md", regex: /rounded-md\b/ },
  { name: "rounded-lg", regex: /rounded-lg\b/ },
  { name: "rounded-xl", regex: /rounded-xl\b/ },
];

const tsxFiles = collectTsxFiles(SRC_DIR);

describe("radius vocabulary guard", () => {
  it("scans a non-empty set of tsx files", () => {
    expect(tsxFiles.length).toBeGreaterThan(0);
  });

  for (const { name, regex } of FORBIDDEN_PATTERNS) {
    it(`has zero occurrences of ${name}`, () => {
      const offenders: string[] = [];
      for (const file of tsxFiles) {
        const content = readFileSync(file, "utf8");
        if (new RegExp(regex).test(content)) {
          offenders.push(relative(SRC_DIR, file));
        }
      }
      expect(offenders, `${name} found in:\n${offenders.join("\n")}`).toEqual([]);
    });
  }
});
