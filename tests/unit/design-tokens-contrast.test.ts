// @vitest-environment node
/**
 * 设计令牌 WCAG 对比度回归锁：从 globals.css 抽取 --vr-* 令牌实际值，
 * 按 openspec/changes/restyle-ops-console-2/design.md D3 表断言正文级配对 ≥ 4.5:1。
 * 改动令牌导致断言失败时，先核对 design.md 的对比度契约再调值。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../src/app/globals.css"), "utf8");

function extractBlock(startMarker: string): string {
  const start = css.indexOf(startMarker);
  if (start === -1) throw new Error(`block not found: ${startMarker}`);
  const open = css.indexOf("{", start);
  let depth = 1;
  let i = open + 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") depth -= 1;
    i += 1;
  }
  return css.slice(open + 1, i - 1);
}

const darkBlock = extractBlock(":root,\n.dark {");
const lightBlock = extractBlock(".light {");

function token(block: string, name: string): string {
  // 令牌名只含字母与连字符，连字符在字符类外无正则特殊含义，无需转义。
  const m = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!m) throw new Error(`hex token not found: ${name}`);
  return m[1];
}

function luminance(hex: string): number {
  const c = [0, 2, 4]
    .map((i) => parseInt(hex.slice(1).slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** 复现 color-mix(in srgb, fg N%, transparent) 叠在不透明底上的合成色。 */
function mixOver(fg: string, bg: string, fgRatio: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1).slice(i * 2, i * 2 + 2), 16);
  const mixed = [0, 1, 2].map((i) => Math.round(ch(fg, i) * fgRatio + ch(bg, i) * (1 - fgRatio)));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

describe("暗色主题正文级配对 ≥ 4.5:1 (WCAG AA)", () => {
  const d = (name: string) => token(darkBlock, name);

  const pairs: Array<[string, string, string]> = [
    ["text / surface-0", "--vr-text", "--vr-surface-0"],
    ["text / surface-2", "--vr-text", "--vr-surface-2"],
    ["text-muted / surface-1", "--vr-text-muted", "--vr-surface-1"],
    ["text-muted / surface-2", "--vr-text-muted", "--vr-surface-2"],
    ["accent-500 / surface-1", "--vr-accent-500", "--vr-surface-1"],
    ["accent-400 / surface-1", "--vr-accent-400", "--vr-surface-1"],
    ["accent-ink / accent-500", "--vr-accent-ink", "--vr-accent-500"],
    ["status-success / surface-1", "--vr-status-success", "--vr-surface-1"],
    ["status-warning / surface-1", "--vr-status-warning", "--vr-surface-1"],
    ["status-error / surface-1", "--vr-status-error", "--vr-surface-1"],
  ];

  it.each(pairs)("%s", (_label, fg, bg) => {
    expect(contrast(d(fg), d(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it("text-dim 仅限装饰（大字号 3:1 底线）", () => {
    expect(contrast(d("--vr-text-dim"), d("--vr-surface-1"))).toBeGreaterThanOrEqual(3);
  });

  // StatusBadge/StateChip 模式：text-status-* 叠在 12% muted 底上。
  // 暗色最坏底 = 最亮表面 surface-3 与 muted 合成后的颜色。
  it.each(["success", "warning", "error", "info"])(
    "status-%s / 12%% muted over surface-3",
    (tone) => {
      const fg = d(`--vr-status-${tone}`);
      const bg = mixOver(fg, d("--vr-surface-3"), 0.12);
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
  );
});

describe("亮色主题正文级配对 ≥ 4.5:1 (WCAG AA)", () => {
  const l = (name: string) => token(lightBlock, name);

  const pairs: Array<[string, string, string]> = [
    ["text / surface-0", "--vr-text", "--vr-surface-0"],
    ["text / surface-2", "--vr-text", "--vr-surface-2"],
    ["text-muted / surface-0", "--vr-text-muted", "--vr-surface-0"],
    ["text-muted / surface-2", "--vr-text-muted", "--vr-surface-2"],
    // 亮色文字级 accent 契约：一律使用 600（500 仅限大字号/边框/填充）
    ["accent-600 / surface-0", "--vr-accent-600", "--vr-surface-0"],
    ["accent-600 / surface-2", "--vr-accent-600", "--vr-surface-2"],
    ["accent-ink / accent-500", "--vr-accent-ink", "--vr-accent-500"],
    ["status-success / surface-1", "--vr-status-success", "--vr-surface-1"],
    ["status-warning / surface-1", "--vr-status-warning", "--vr-surface-1"],
    ["status-error / surface-1", "--vr-status-error", "--vr-surface-1"],
    ["status-info / surface-1", "--vr-status-info", "--vr-surface-1"],
  ];

  it.each(pairs)("%s", (_label, fg, bg) => {
    expect(contrast(l(fg), l(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it("accent-500 大字号/图形级底线 3:1", () => {
    expect(contrast(l("--vr-accent-500"), l("--vr-surface-0"))).toBeGreaterThanOrEqual(3);
  });

  // 亮色最坏底 = 最深表面 surface-3 与 12% muted 合成（axe 实测暴露的配对）。
  it.each(["success", "warning", "error", "info"])(
    "status-%s / 12%% muted over surface-3",
    (tone) => {
      const fg = l(`--vr-status-${tone}`);
      const bg = mixOver(fg, l("--vr-surface-3"), 0.12);
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
  );
});
