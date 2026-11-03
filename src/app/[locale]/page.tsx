import { setRequestLocale } from "next-intl/server";

import { LandingPage } from "@/components/landing/landing-page";

interface LocaleHomePageProps {
  params: Promise<{ locale: string }>;
}

/**
 * Locale root page - public landing page.
 * Authenticated users are redirected to their workspace client-side.
 */
export default async function LocaleHomePage({ params }: LocaleHomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LandingPage />;
}
