import { describe, expect, it } from "vitest";

import {
  chartTheme,
  formatCost,
  formatDuration,
  formatNumber,
  getChartTheme,
  getUpstreamColor,
  UPSTREAM_COLORS_DARK,
  UPSTREAM_COLORS_LIGHT,
} from "@/components/dashboard/chart-theme";

// 图表色值必须与 globals.css 的 --vr-* 令牌真源保持一致（Recharts 写 SVG
// 属性无法用 var()，chart-theme 是唯一允许的字面色值层）。改令牌时这里的
// 期望值要一起改，防止图表配色与全站令牌静默漂移。
describe("getChartTheme", () => {
  it("dark primary matches the dark --vr-accent-500 token", () => {
    expect(getChartTheme("dark").colors.primary).toBe("#f2a950");
  });

  it("light primary matches the light --vr-accent-500 token", () => {
    expect(getChartTheme("light").colors.primary).toBe("#9a6410");
  });

  it("dark tooltip surfaces match the dark surface/border tokens", () => {
    const { tooltip } = getChartTheme("dark").colors;
    expect(tooltip.background).toBe("#1a1e24");
    expect(tooltip.border).toBe("#2b323c");
  });

  it("fonts reference CSS variables instead of literal font stacks", () => {
    const { fonts } = getChartTheme("dark");
    expect(fonts.mono).toBe("var(--vr-font-mono)");
    expect(fonts.display).toBe("var(--vr-font-display)");
  });

  it("keeps the backward-compatible chartTheme export as the dark theme", () => {
    expect(chartTheme).toEqual(getChartTheme("dark"));
  });
});

describe("upstream palette", () => {
  it("leads both palettes with the mode's accent-500", () => {
    expect(UPSTREAM_COLORS_DARK[0]).toBe("#f2a950");
    expect(UPSTREAM_COLORS_LIGHT[0]).toBe("#9a6410");
  });

  it("provides 8 series colors per mode", () => {
    expect(UPSTREAM_COLORS_DARK).toHaveLength(8);
    expect(UPSTREAM_COLORS_LIGHT).toHaveLength(8);
  });

  it("wraps around the palette and distinguishes modes", () => {
    expect(getUpstreamColor(0)).toBe(UPSTREAM_COLORS_DARK[0]);
    expect(getUpstreamColor(8, "dark")).toBe(UPSTREAM_COLORS_DARK[0]);
    expect(getUpstreamColor(1, "light")).toBe(UPSTREAM_COLORS_LIGHT[1]);
  });
});

describe("formatters", () => {
  it("formatNumber abbreviates thousands and millions", () => {
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(1_500)).toBe("1.5K");
    expect(formatNumber(2_400_000)).toBe("2.4M");
  });

  it("formatDuration switches to seconds at 1000ms", () => {
    expect(formatDuration(850)).toBe("850ms");
    expect(formatDuration(1_250)).toBe("1.3s");
  });

  it("formatCost keeps sub-cent amounts visible", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.0042)).toBe("$0.0042");
    expect(formatCost(3.5)).toBe("$3.50");
    expect(formatCost(1_200)).toBe("$1.20K");
  });
});
