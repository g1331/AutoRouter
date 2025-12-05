import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Cassette Futurism Design System - Tailwind Configuration
 *
 * Extends Tailwind with custom tokens from globals.css CSS variables.
 * All color/font/spacing values reference CSS custom properties for consistency.
 */

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        /* Amber Scale (Primary) */
        amber: {
          50: "var(--cf-amber-50)",
          100: "var(--cf-amber-100)",
          200: "var(--cf-amber-200)",
          300: "var(--cf-amber-300)",
          400: "var(--cf-amber-400)",
          500: "var(--cf-amber-500)",
          600: "var(--cf-amber-600)",
          700: "var(--cf-amber-700)",
          800: "var(--cf-amber-800)",
          900: "var(--cf-amber-900)",
        },
        /* Black Scale (Backgrounds) */
        black: {
          900: "var(--cf-black-900)",
          800: "var(--cf-black-800)",
          700: "var(--cf-black-700)",
          600: "var(--cf-black-600)",
          500: "var(--cf-black-500)",
        },
        /* Surface Scale (Semantic Backgrounds) */
        surface: {
          100: "var(--cf-surface-100)",
          200: "var(--cf-surface-200)",
          300: "var(--cf-surface-300)",
          400: "var(--cf-surface-400)",
          500: "var(--cf-surface-500)",
          600: "var(--cf-surface-600)",
        },
        /* Status Colors */
        status: {
          success: "var(--cf-status-success)",
          "success-muted": "var(--cf-status-success-muted)",
          warning: "var(--cf-status-warning)",
          "warning-muted": "var(--cf-status-warning-muted)",
          error: "var(--cf-status-error)",
          "error-muted": "var(--cf-status-error-muted)",
          info: "var(--cf-status-info)",
          "info-muted": "var(--cf-status-info-muted)",
        },
        /* Functional Tokens */
        disabled: {
          bg: "var(--cf-disabled-bg)",
          text: "var(--cf-disabled-text)",
          border: "var(--cf-disabled-border)",
        },
        divider: {
          DEFAULT: "var(--cf-divider)",
          subtle: "var(--cf-divider-subtle)",
        },
        overlay: {
          DEFAULT: "var(--cf-overlay)",
          light: "var(--cf-overlay-light)",
        },
        /* Shadcn/ui Compatibility */
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
        /* Sidebar */
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
        sans: ["var(--cf-font-sans)"],
        mono: ["var(--cf-font-mono)"],
        display: ["var(--cf-font-display)"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) * 0.75)",
        sm: "calc(var(--radius) * 0.5)",
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
        cf: "var(--cf-focus-ring-width)",
      },
      ringOffsetWidth: {
        cf: "var(--cf-focus-ring-offset)",
      },
      boxShadow: {
        "cf-glow-subtle": "var(--cf-glow-subtle)",
        "cf-glow-medium": "var(--cf-glow-medium)",
        "cf-glow-strong": "var(--cf-glow-strong)",
        "cf-glow-success": "var(--cf-glow-success)",
        "cf-glow-error": "var(--cf-glow-error)",
        "cf-glow-info": "var(--cf-glow-info)",
        "cf-focus": "var(--cf-focus-glow)",
      },
      transitionDuration: {
        "cf-fast": "var(--cf-duration-fast)",
        "cf-normal": "var(--cf-duration-normal)",
        "cf-slow": "var(--cf-duration-slow)",
      },
      transitionTimingFunction: {
        "cf-standard": "var(--cf-easing-standard)",
        "cf-sharp": "var(--cf-easing-sharp)",
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        shimmer: "shimmer 2s infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
