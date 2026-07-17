/**
 * Dashboard chart theme tokens and formatters (Ops Console 2.0).
 *
 * Recharts 把颜色写进 SVG presentation attribute，无法解析 var()，因此这里
 * 保留字面色值作为「图表令牌层」——数值必须与 globals.css 的 --vr-* 真源
 * 保持一致（dark accent-500 #f2a950 / light accent-500 #9a6410、surface 与
 * text 梯度同源）。改令牌时同步改这里。
 */

export type ChartThemeMode = "dark" | "light";

// 上游序列 8 色：首位 = accent-500，其余为同明度带的低饱和辅助色，
// 避开状态色（success/warning/error）的色相以免与告警语义混淆。
export const UPSTREAM_COLORS_DARK = [
  "#f2a950",
  "#56a99a",
  "#7fae74",
  "#d98a66",
  "#9d86c0",
  "#b3a05e",
  "#6f95b5",
  "#b57f96",
] as const;

export const UPSTREAM_COLORS_LIGHT = [
  "#9a6410",
  "#2f7f71",
  "#3e7c4e",
  "#a85e40",
  "#6e548d",
  "#7b6a3f",
  "#486a87",
  "#85586e",
] as const;

// Backward-compatible export (defaults to dark palette).
export const UPSTREAM_COLORS = [...UPSTREAM_COLORS_DARK];

const CHART_THEME_BY_MODE = {
  dark: {
    colors: {
      primary: "#f2a950",
      primaryMuted: "rgba(242, 169, 80, 0.24)",
      grid: "rgba(242, 169, 80, 0.12)",
      text: "#9aa2ae",
      textStrong: "#e8e4da",
      textMuted: "rgba(154, 162, 174, 0.7)",
      background: "#15181d",
      tooltip: {
        background: "#1a1e24",
        border: "#2b323c",
      },
    },
    area: {
      opacityStart: 0.32,
      opacityEnd: 0.02,
    },
    bar: {
      opacity: 0.4,
    },
  },
  light: {
    colors: {
      primary: "#9a6410",
      primaryMuted: "rgba(154, 100, 16, 0.2)",
      grid: "rgba(154, 100, 16, 0.14)",
      text: "#5f6570",
      textStrong: "#212327",
      textMuted: "rgba(95, 101, 112, 0.72)",
      background: "#fdfdfe",
      tooltip: {
        background: "#fdfdfe",
        border: "#c6cbd2",
      },
    },
    area: {
      opacityStart: 0.26,
      opacityEnd: 0.04,
    },
    bar: {
      opacity: 0.32,
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

// TTFT keeps millisecond precision when crossing into seconds (unlike
// formatDuration's 1-decimal display for coarse durations).
export function formatTtft(ttftMs: number): string {
  if (ttftMs >= 1000) {
    return `${(ttftMs / 1000).toFixed(3)}s`;
  }
  return `${Math.round(ttftMs)}ms`;
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(2)}K`;
  if (usd >= 0.01) return `$${usd.toFixed(2)}`;
  // 小于一分时保留四位小数，既能让真实存在的消费显示出来，又不会过长
  return `$${usd.toFixed(4)}`;
}
