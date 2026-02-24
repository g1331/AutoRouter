import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
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
      className={`${manrope.variable} ${jetbrainsMono.variable}`}
    >
      <head />
      <body className={manrope.className}>{children}</body>
    </html>
  );
}
