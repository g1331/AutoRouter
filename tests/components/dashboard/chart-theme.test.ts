import { describe, it, expect } from "vitest";

import {
  ChartThemeMode,
  UPSTREAM_COLORS,
  UPSTREAM_COLORS_DARK,
  UPSTREAM_COLORS_LIGHT,
  chartTheme,
  formatDuration,
  formatNumber,
  getChartTheme,
  getUpstreamColor,
} from "@/components/dashboard/chart-theme";

describe("chart-theme", () => {
  describe("upstream palettes", () => {
    it("keeps 8 colors in each palette", () => {
      expect(UPSTREAM_COLORS_DARK).toHaveLength(8);
      expect(UPSTREAM_COLORS_LIGHT).toHaveLength(8);
      expect(UPSTREAM_COLORS).toHaveLength(8);
    });

    it("contains valid hex colors", () => {
      [...UPSTREAM_COLORS_DARK, ...UPSTREAM_COLORS_LIGHT].forEach((color) => {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });

    it("exposes dark palette through backward-compatible UPSTREAM_COLORS", () => {
      expect(UPSTREAM_COLORS[0]).toBe(UPSTREAM_COLORS_DARK[0]);
      expect(UPSTREAM_COLORS[7]).toBe(UPSTREAM_COLORS_DARK[7]);
    });
  });

  describe("theme structure", () => {
    it("provides theme configuration for both modes", () => {
      const modes: ChartThemeMode[] = ["dark", "light"];
      modes.forEach((mode) => {
        const theme = getChartTheme(mode);
        expect(theme.colors.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(theme.colors.grid).toContain("rgba(");
        expect(theme.colors.tooltip.background).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(theme.colors.tooltip.border).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(theme.spacing.xAxisHeight).toBe(30);
        expect(theme.spacing.yAxisWidth).toBe(60);
        expect(theme.fonts.mono).toContain("var(--vr-font-mono)");
      });
    });

    it("keeps backward-compatible chartTheme export as dark mode", () => {
      expect(chartTheme).toEqual(getChartTheme("dark"));
    });
  });

  describe("getUpstreamColor", () => {
    it("returns color by index in dark mode by default", () => {
      expect(getUpstreamColor(0)).toBe(UPSTREAM_COLORS_DARK[0]);
      expect(getUpstreamColor(1)).toBe(UPSTREAM_COLORS_DARK[1]);
    });

    it("returns light palette when mode is light", () => {
      expect(getUpstreamColor(0, "light")).toBe(UPSTREAM_COLORS_LIGHT[0]);
      expect(getUpstreamColor(1, "light")).toBe(UPSTREAM_COLORS_LIGHT[1]);
    });

    it("wraps around for larger indices", () => {
      expect(getUpstreamColor(8, "dark")).toBe(UPSTREAM_COLORS_DARK[0]);
      expect(getUpstreamColor(9, "light")).toBe(UPSTREAM_COLORS_LIGHT[1]);
    });
  });

  describe("formatNumber", () => {
    it("formats millions with M suffix", () => {
      expect(formatNumber(1_000_000)).toBe("1.0M");
      expect(formatNumber(1_500_000)).toBe("1.5M");
      expect(formatNumber(10_000_000)).toBe("10.0M");
    });

    it("formats thousands with K suffix", () => {
      expect(formatNumber(1_000)).toBe("1.0K");
      expect(formatNumber(1_500)).toBe("1.5K");
      expect(formatNumber(999_999)).toBe("1000.0K");
    });

    it("returns number as string for values under 1000", () => {
      expect(formatNumber(0)).toBe("0");
      expect(formatNumber(1)).toBe("1");
      expect(formatNumber(42)).toBe("42");
      expect(formatNumber(999)).toBe("999");
    });

    it("handles edge cases", () => {
      expect(formatNumber(1000)).toBe("1.0K");
      expect(formatNumber(1000000)).toBe("1.0M");
    });
  });

  describe("formatDuration", () => {
    it("formats milliseconds under 1000 with ms suffix", () => {
      expect(formatDuration(0)).toBe("0ms");
      expect(formatDuration(1)).toBe("1ms");
      expect(formatDuration(50)).toBe("50ms");
      expect(formatDuration(999)).toBe("999ms");
    });

    it("formats 1000ms and above with s suffix", () => {
      expect(formatDuration(1000)).toBe("1.0s");
      expect(formatDuration(1500)).toBe("1.5s");
      expect(formatDuration(2000)).toBe("2.0s");
    });

    it("rounds milliseconds to nearest integer", () => {
      expect(formatDuration(50.4)).toBe("50ms");
      expect(formatDuration(50.6)).toBe("51ms");
    });

    it("handles large durations", () => {
      expect(formatDuration(60000)).toBe("60.0s");
      expect(formatDuration(3600000)).toBe("3600.0s");
    });
  });
});
