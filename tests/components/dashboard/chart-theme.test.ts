import { describe, it, expect } from "vitest";
import {
  UPSTREAM_COLORS,
  chartTheme,
  getUpstreamColor,
  formatNumber,
  formatDuration,
} from "@/components/dashboard/chart-theme";

describe("chart-theme", () => {
  describe("UPSTREAM_COLORS", () => {
    it("has 8 colors defined", () => {
      expect(UPSTREAM_COLORS).toHaveLength(8);
    });

    it("has amber-500 as first color", () => {
      expect(UPSTREAM_COLORS[0]).toBe("#FFBF00");
    });

    it("all colors are valid hex codes", () => {
      UPSTREAM_COLORS.forEach((color) => {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });
  });

  describe("chartTheme", () => {
    it("has colors configuration", () => {
      expect(chartTheme.colors).toBeDefined();
      expect(chartTheme.colors.primary).toBe("#FFBF00");
    });

    it("has fonts configuration", () => {
      expect(chartTheme.fonts).toBeDefined();
      expect(chartTheme.fonts.mono).toContain("JetBrains Mono");
    });

    it("has spacing configuration", () => {
      expect(chartTheme.spacing).toBeDefined();
      expect(chartTheme.spacing.xAxisHeight).toBe(30);
      expect(chartTheme.spacing.yAxisWidth).toBe(60);
    });

    it("has tooltip colors", () => {
      expect(chartTheme.colors.tooltip).toBeDefined();
      expect(chartTheme.colors.tooltip.background).toBe("#2A2A2A");
      expect(chartTheme.colors.tooltip.border).toBe("#FFBF00");
    });
  });

  describe("getUpstreamColor", () => {
    it("returns first color for index 0", () => {
      expect(getUpstreamColor(0)).toBe("#FFBF00");
    });

    it("returns second color for index 1", () => {
      expect(getUpstreamColor(1)).toBe("#00D4FF");
    });

    it("wraps around when index exceeds array length", () => {
      expect(getUpstreamColor(8)).toBe("#FFBF00"); // Should wrap to index 0
      expect(getUpstreamColor(9)).toBe("#00D4FF"); // Should wrap to index 1
    });

    it("handles large indices correctly", () => {
      expect(getUpstreamColor(100)).toBe(UPSTREAM_COLORS[100 % 8]);
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
