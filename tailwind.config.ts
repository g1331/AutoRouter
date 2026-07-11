import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        amber: {
          100: "var(--vr-accent-100)",
          200: "var(--vr-accent-200)",
          300: "var(--vr-accent-300)",
          400: "var(--vr-accent-400)",
          500: "var(--vr-accent-500)",
          600: "var(--vr-accent-600)",
          700: "var(--vr-accent-700)",
          800: "var(--vr-accent-800)",
          900: "var(--vr-accent-900)",
        },
        black: {
          900: "var(--vr-surface-0)",
        },
        surface: {
          100: "var(--vr-surface-0)",
          200: "var(--vr-surface-1)",
          300: "var(--vr-surface-2)",
          400: "var(--vr-surface-3)",
          500: "var(--vr-surface-4)",
        },
        status: {
          success: "var(--vr-status-success)",
          "success-muted": "var(--vr-status-success-muted)",
          warning: "var(--vr-status-warning)",
          "warning-muted": "var(--vr-status-warning-muted)",
          error: "var(--vr-status-error)",
          "error-muted": "var(--vr-status-error-muted)",
          info: "var(--vr-status-info)",
          "info-muted": "var(--vr-status-info-muted)",
        },
        disabled: {
          bg: "var(--vr-disabled-bg)",
          text: "var(--vr-disabled-text)",
          border: "var(--vr-disabled-border)",
        },
        divider: {
          DEFAULT: "var(--vr-border)",
          subtle: "var(--vr-border-subtle)",
        },
        overlay: {
          DEFAULT: "var(--vr-overlay)",
          light: "var(--vr-overlay-soft)",
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      fontFamily: {
        sans: ["var(--vr-font-sans)"],
        mono: ["var(--vr-font-mono)"],
        display: ["var(--vr-font-display)"],
      },
      borderRadius: {
        lg: "var(--vr-radius-lg)",
        md: "var(--vr-radius-md)",
        sm: "var(--vr-radius-sm)",
        "cf-sm": "var(--vr-radius-xs)",
        "cf-md": "var(--vr-radius-sm)",
      },
      ringWidth: {
        cf: "var(--vr-focus-ring-width)",
      },
      ringOffsetWidth: {
        cf: "var(--vr-focus-ring-offset)",
      },
      boxShadow: {
        "cf-glow-subtle": "var(--vr-shadow-glow-subtle)",
        "cf-glow-medium": "var(--vr-shadow-glow-medium)",
      },
      transitionDuration: {
        "cf-fast": "var(--vr-motion-fast)",
        "cf-normal": "var(--vr-motion-normal)",
      },
      transitionTimingFunction: {
        "cf-standard": "var(--vr-easing-standard)",
      },
    },
  },
  plugins: [animate],
};

export default config;
