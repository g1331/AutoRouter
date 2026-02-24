/**
 * Dashboard chart theme tokens and formatters.
 * Uses restrained neutral-first palette and provides dark/light variants.
 */

export type ChartThemeMode = "dark" | "light";

export const UPSTREAM_COLORS_DARK = [
  "#BF965C",
  "#4C9A8B",
  "#6BA06A",
  "#C97A5A",
  "#8E6EA8",
  "#9A8555",
  "#5E7E9A",
  "#A16D82",
] as const;

export const UPSTREAM_COLORS_LIGHT = [
  "#8D6840",
  "#2F7F71",
  "#3E7C4E",
  "#A85E40",
  "#6E548D",
  "#7B6A3F",
  "#486A87",
  "#85586E",
] as const;

// Backward-compatible export (defaults to dark palette).
export const UPSTREAM_COLORS = [...UPSTREAM_COLORS_DARK];

const CHART_THEME_BY_MODE = {
  dark: {
    colors: {
      primary: "#BF965C",
      primaryMuted: "rgba(191, 150, 92, 0.24)",
      grid: "rgba(191, 150, 92, 0.14)",
      text: "#B8C0C8",
      textStrong: "#EDF1F4",
      textMuted: "rgba(184, 192, 200, 0.7)",
      background: "#1D2227",
      tooltip: {
        background: "#1D2227",
        border: "#3A424C",
      },
    },
    area: {
      opacityStart: 0.32,
      opacityEnd: 0.02,
    },
  },
  light: {
    colors: {
      primary: "#8D6840",
      primaryMuted: "rgba(141, 104, 64, 0.2)",
      grid: "rgba(141, 104, 64, 0.15)",
      text: "#60584D",
      textStrong: "#26221B",
      textMuted: "rgba(96, 88, 77, 0.72)",
      background: "#FFFFFF",
      tooltip: {
        background: "#FFFFFF",
        border: "#CBC1B3",
      },
    },
    area: {
      opacityStart: 0.26,
      opacityEnd: 0.04,
    },
  },
} as const;

const BASE_CHART_THEME = {
  fonts: {
    mono: "var(--vr-font-mono)",
    display: "var(--vr-font-display)",
  },
  spacing: {
    xAxisHeight: 30,
    yAxisWidth: 60,
    margin: { top: 10, right: 10, left: 0, bottom: 0 },
  },
} as const;

export function getChartTheme(mode: ChartThemeMode) {
  return {
    ...BASE_CHART_THEME,
    ...CHART_THEME_BY_MODE[mode],
  };
}

// Backward-compatible export used by existing consumers/tests.
export const chartTheme = getChartTheme("dark");

export function getUpstreamColor(index: number, mode: ChartThemeMode = "dark"): string {
  const palette = mode === "light" ? UPSTREAM_COLORS_LIGHT : UPSTREAM_COLORS_DARK;
  return palette[index % palette.length];
}

export function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toString();
}

export function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}
