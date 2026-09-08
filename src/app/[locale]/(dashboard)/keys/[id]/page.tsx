"use client";

import type { ComponentType } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CalendarClock,
  Gauge,
  KeyRound,
  ListChecks,
  Shield,
  Type,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { QueryStatus } from "@/components/ui/query-status";
import { PageHeader } from "@/components/admin/page-header";
import { PageShell } from "@/components/admin/page-shell";
import { Topbar } from "@/components/admin/topbar";
import { AccessGrantsSection } from "@/components/admin/key/sections/access-grants-section";
import { BasicSection } from "@/components/admin/key/sections/basic-section";
import { ExpirySection } from "@/components/admin/key/sections/expiry-section";
import { ModelAllowlistSection } from "@/components/admin/key/sections/model-allowlist-section";
import { RateLimitsSection } from "@/components/admin/key/sections/rate-limits-section";
import { SpendingRulesSection } from "@/components/admin/key/sections/spending-rules-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconBox } from "@/components/ui/icon-box";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { useApiKey } from "@/hooks/use-api-keys";
import { ApiError } from "@/lib/api";
import type { APIKeyResponse } from "@/types/api";

type KeyDetailCategory = "configCategoryBasic" | "configCategoryPolicy";

interface KeyDetailSection {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  category: KeyDetailCategory;
}

// Section list, ids, and grouping mirror the detail-page contract in design.md.
// Access mode and upstream grants share one section because they cross-validate.
const KEY_DETAIL_SECTIONS: KeyDetailSection[] = [
  { id: "basic", labelKey: "sectionBasicTitle", icon: Type, category: "configCategoryBasic" },
  {
    id: "expiry",
    labelKey: "expirationDate",
    icon: CalendarClock,
    category: "configCategoryBasic",
  },
  {
    id: "access-grants",
    labelKey: "sectionAccessTitle",
    icon: Shield,
    category: "configCategoryPolicy",
  },
  {
    id: "spending-rules",
    labelKey: "spendingRules",
    icon: Wallet,
    category: "configCategoryPolicy",
  },
  {
    id: "rate-limits",
    labelKey: "rateLimits",
    icon: Gauge,
    category: "configCategoryPolicy",
  },
  {
    id: "model-allowlist",
    labelKey: "allowedModels",
    icon: ListChecks,
    category: "configCategoryPolicy",
  },
];

const DETAIL_CATEGORY_ORDER: KeyDetailCategory[] = ["configCategoryBasic", "configCategoryPolicy"];

// Maps each section id to its self-saving form component. Each owns its own
// react-hook-form instance and persists a partial PUT.
const SECTION_COMPONENTS: Record<string, ComponentType<{ apiKey: APIKeyResponse }>> = {
  basic: BasicSection,
  expiry: ExpirySection,
  "access-grants": AccessGrantsSection,
  "spending-rules": SpendingRulesSection,
  "rate-limits": RateLimitsSection,
  "model-allowlist": ModelAllowlistSection,
};

export default function KeyDetailPage() {
  const params = useParams<{ id: string }>();
  const keyId = params.id;
  const t = useTranslations("keys");
  const tCommon = useTranslations("common");

  const { data: apiKey, isLoading, error, refetch } = useApiKey(keyId);
  const notFound = error instanceof ApiError && error.status === 404;
  const loadFailed = Boolean(error) && !notFound && !apiKey;

  const groupedSections = DETAIL_CATEGORY_ORDER.map((category) => ({
    category,
    sections: KEY_DETAIL_SECTIONS.filter((section) => section.category === category),
  })).filter((group) => group.sections.length > 0);

  return (
    <>
      <Topbar title={t("detailTitle")} />

      <PageShell maxWidth="7xl">
        <Button variant="ghost" size="sm" className="w-fit gap-2 text-muted-foreground" asChild>
          <Link href="/keys">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("backToKeys")}
          </Link>
        </Button>

        {notFound ? (
          <Card variant="outlined" className="bg-card">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <h2 className="type-title-medium text-foreground">{t("keyNotFound")}</h2>
              <p className="type-body-medium text-muted-foreground">{t("keyNotFoundHint")}</p>
            </CardContent>
          </Card>
        ) : loadFailed ? (
          <Card variant="outlined" className="bg-card">
            <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="space-y-2">
                <h2 className="type-title-medium text-foreground">{t("keyLoadFailed")}</h2>
                <p className="type-body-medium text-muted-foreground">{t("keyLoadFailedHint")}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {tCommon("retry")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <PageHeader
              icon={KeyRound}
              title={isLoading ? t("detailTitle") : (apiKey?.name ?? keyId)}
              description={isLoading ? undefined : apiKey?.key_prefix}
            />

            <QueryStatus error={error} hasData onRetry={() => void refetch()} />
            <div className="flex flex-col gap-6 lg:flex-row">
              <aside className="sticky top-14 z-10 min-w-0 bg-background py-2 lg:static lg:w-56 lg:shrink-0 lg:py-0">
                <nav
                  aria-label={t("detailTitle")}
                  className="flex gap-2 overflow-x-auto rounded-cf-md border border-border/60 bg-card p-2 lg:sticky lg:top-14 lg:block lg:space-y-4 lg:p-3"
                >
                  {groupedSections.map((group) => (
                    <div key={group.category} className="flex shrink-0 gap-1 lg:block lg:space-y-1">
                      <p className="type-caption hidden px-2 text-muted-foreground lg:block">
                        {t(group.category)}
                      </p>
                      {group.sections.map((section) => (
                        <a
                          key={section.id}
                          href={`#${section.id}`}
                          className="flex items-center gap-2 whitespace-nowrap rounded-cf-sm px-2 py-1.5 text-sm text-muted-foreground transition-colors duration-cf-fast hover:bg-surface-300/65 hover:text-foreground"
                        >
                          <section.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">{t(section.labelKey)}</span>
                        </a>
                      ))}
                    </div>
                  ))}
                </nav>
              </aside>

              <div className="min-w-0 flex-1 space-y-6">
                {KEY_DETAIL_SECTIONS.map((section) => {
                  const SectionComponent = SECTION_COMPONENTS[section.id];
                  return (
                    <section
                      key={section.id}
                      id={section.id}
                      className="scroll-mt-32 lg:scroll-mt-14"
                    >
                      {isLoading || !apiKey ? (
                        <Card variant="outlined" className="bg-card">
                          <div className="flex items-center gap-3 border-b border-divider px-5 py-3.5">
                            <IconBox>
                              <section.icon className="h-4 w-4" aria-hidden="true" />
                            </IconBox>
                            <h3 className="type-label-medium text-foreground">
                              {t(section.labelKey)}
                            </h3>
                          </div>
                          <CardContent className="space-y-2 p-5">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-9 w-full" />
                          </CardContent>
                        </Card>
                      ) : SectionComponent ? (
                        <SectionComponent key={apiKey.id} apiKey={apiKey} />
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </PageShell>
    </>
  );
}
