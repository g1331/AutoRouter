/**
 * Recharts theme configuration for Cassette Futurism design system.
 *
 * Provides consistent styling for all charts matching the amber/terminal aesthetic.
 */

// Colors for different upstream series in charts
export const UPSTREAM_COLORS = [
  "#FFBF00", // amber-500 (primary)
  "#00D4FF", // info (cyan)
  "#00FF41", // success (green)
  "#FF6B6B", // coral red
  "#9B59B6", // purple
  "#FF9500", // orange
  "#E91E63", // pink
  "#00BCD4", // teal
];

// Chart theme configuration
export const chartTheme = {
  // Colors
  colors: {
    primary: "#FFBF00",
    primaryMuted: "rgba(255, 191, 0, 0.2)",
    grid: "rgba(255, 191, 0, 0.1)",
    text: "#B38F00",
    textMuted: "rgba(255, 191, 0, 0.5)",
    background: "#1A1A1A",
    tooltip: {
      background: "#2A2A2A",
      border: "#FFBF00",
    },
  },

  // Fonts
  fonts: {
    mono: "'JetBrains Mono', 'IBM Plex Mono', monospace",
    display: "'VT323', monospace",
  },

  // Spacing
  spacing: {
    xAxisHeight: 30,
    yAxisWidth: 60,
    margin: { top: 10, right: 10, left: 0, bottom: 0 },
  },
};

/**
 * Get color for an upstream series by index.
 */
export function getUpstreamColor(index: number): string {
  return UPSTREAM_COLORS[index % UPSTREAM_COLORS.length];
}

/**
 * Format large numbers for display (e.g., 1.2M, 456K).
 */
export function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toString();
}

/**
 * Format duration in milliseconds for display.
 */
export function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}
