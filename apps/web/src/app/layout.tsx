import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Cassette Futurism Design System - Font Configuration
 *
 * - Inter: Body text, descriptions (sans-serif with CJK fallback)
 * - JetBrains Mono: Data, UI chrome, code (monospace)
 * - VT323: Display numbers, titles (pixel font) - loaded via CSS for weight control
 */

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-sans",
  fallback: [
    "Noto Sans SC",
    "Source Han Sans SC",
    "PingFang SC",
    "Microsoft YaHei",
    "system-ui",
    "-apple-system",
    "sans-serif",
  ],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-mono",
  fallback: [
    "IBM Plex Mono",
    "Fira Code",
    "Noto Sans Mono CJK SC",
    "Source Han Mono SC",
    "SFMono-Regular",
    "Menlo",
    "Monaco",
    "Consolas",
    "monospace",
  ],
});

export const metadata: Metadata = {
  title: "AutoRouter Admin",
  description: "AI API Gateway Management Console",
};

interface RootLayoutProps {
  children: React.ReactNode;
  params?: Promise<{ locale?: string }>;
}

export default async function RootLayout({ children, params }: RootLayoutProps) {
  const resolvedParams = await params;
  const locale = resolvedParams?.locale || "zh-CN";

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* VT323 pixel font loaded via Google Fonts link for better weight control */}
        <link href="https://fonts.googleapis.com/css2?family=VT323&display=swap" rel="stylesheet" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
