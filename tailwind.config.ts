import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        amber: {
          50: "var(--vr-accent-50)",
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
          800: "var(--vr-surface-1)",
          700: "var(--vr-surface-2)",
          600: "var(--vr-surface-3)",
          500: "var(--vr-surface-4)",
        },
        surface: {
          100: "var(--vr-surface-0)",
          200: "var(--vr-surface-1)",
          300: "var(--vr-surface-2)",
          400: "var(--vr-surface-3)",
          500: "var(--vr-surface-4)",
          600: "var(--vr-surface-4)",
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
        "cf-none": "var(--cf-corner-none)",
        "cf-sm": "var(--cf-corner-small)",
        "cf-md": "var(--cf-corner-medium)",
        "cf-bevel": "var(--cf-corner-bevel)",
      },
      borderWidth: {
        "cf-thin": "1px",
        "cf-medium": "2px",
        "cf-thick": "3px",
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
        "cf-glow-strong": "var(--vr-shadow-glow-strong)",
        "cf-glow-success": "0 0 0 1px rgb(72 164 118 / 0.34)",
        "cf-glow-error": "0 0 0 1px rgb(204 97 86 / 0.34)",
        "cf-glow-info": "0 0 0 1px rgb(102 148 184 / 0.34)",
        "cf-focus": "var(--vr-focus-ring-shadow)",
      },
      transitionDuration: {
        "cf-fast": "var(--vr-motion-fast)",
        "cf-normal": "var(--vr-motion-normal)",
        "cf-slow": "var(--vr-motion-slow)",
      },
      transitionTimingFunction: {
        "cf-standard": "var(--vr-easing-standard)",
        "cf-sharp": "var(--vr-easing-sharp)",
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
      },
      animation: {
        shimmer: "shimmer 2s linear infinite",
        scanline: "scanline 1.6s linear infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
