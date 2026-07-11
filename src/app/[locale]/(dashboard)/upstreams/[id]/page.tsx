"use client";

import type { ComponentType } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Coins,
  FileText,
  Gauge,
  KeyRound,
  Link2,
  Route,
  Server,
  Shield,
  Shuffle,
  SlidersHorizontal,
  Type,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { PageShell } from "@/components/admin/page-shell";
import { Topbar } from "@/components/admin/topbar";
import { AffinityMigrationSection } from "@/components/admin/upstream/sections/affinity-migration-section";
import { BasicApiKeySection } from "@/components/admin/upstream/sections/basic-api-key-section";
import { BasicDiagnosticsSection } from "@/components/admin/upstream/sections/basic-diagnostics-section";
import { BasicNameSection } from "@/components/admin/upstream/sections/basic-name-section";
import { BasicProfileSection } from "@/components/admin/upstream/sections/basic-profile-section";
import { BasicRouteEndpointSection } from "@/components/admin/upstream/sections/basic-route-endpoint-section";
import { BillingMultipliersSection } from "@/components/admin/upstream/sections/billing-multipliers-section";
import { CapacityControlSection } from "@/components/admin/upstream/sections/capacity-control-section";
import { CircuitBreakerSection } from "@/components/admin/upstream/sections/circuit-breaker-section";
import { FailureRulesSection } from "@/components/admin/upstream/sections/failure-rules-section";
import { ModelRoutingSection } from "@/components/admin/upstream/sections/model-routing-section";
import { PriorityWeightSection } from "@/components/admin/upstream/sections/priority-weight-section";
import { SpendingQuotaSection } from "@/components/admin/upstream/sections/spending-quota-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconBox } from "@/components/ui/icon-box";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { useUpstream } from "@/hooks/use-upstreams";
import { ApiError } from "@/lib/api";
import type { Upstream } from "@/types/api";

type UpstreamDetailCategory =
  | "configCategoryBasic"
  | "configCategoryStrategy"
  | "configCategoryReliability";

interface UpstreamDetailSection {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  category: UpstreamDetailCategory;
}

// Section list and ids mirror the detail-page contract in design.md (13 sections
// across three categories). The section forms land in Phase B2 — B1 only renders
// the navigation scaffold and per-section placeholders.
const UPSTREAM_DETAIL_SECTIONS: UpstreamDetailSection[] = [
  { id: "basic-name", labelKey: "upstreamName", icon: Type, category: "configCategoryBasic" },
  {
    id: "basic-profile",
    labelKey: "officialWebsiteUrl",
    icon: FileText,
    category: "configCategoryBasic",
  },
  {
    id: "basic-route-endpoint",
    labelKey: "baseUrl",
    icon: Link2,
    category: "configCategoryBasic",
  },
  { id: "basic-api-key", labelKey: "apiKey", icon: KeyRound, category: "configCategoryBasic" },
  {
    id: "basic-diagnostics",
    labelKey: "probeDiagnostics",
    icon: CheckCircle2,
    category: "configCategoryBasic",
  },
  {
    id: "priority-weight",
    labelKey: "priorityAndWeight",
    icon: SlidersHorizontal,
    category: "configCategoryStrategy",
  },
  {
    id: "model-routing",
    labelKey: "modelBasedRouting",
    icon: Route,
    category: "configCategoryStrategy",
  },
  {
    id: "billing-multipliers",
    labelKey: "billingMultipliers",
    icon: Coins,
    category: "configCategoryStrategy",
  },
  {
    id: "spending-quota",
    labelKey: "spendingQuota",
    icon: Wallet,
    category: "configCategoryStrategy",
  },
  {
    id: "capacity-control",
    labelKey: "capacityAndQueue",
    icon: Gauge,
    category: "configCategoryReliability",
  },
  {
    id: "circuit-breaker",
    labelKey: "circuitBreakerConfig",
    icon: Shield,
    category: "configCategoryReliability",
  },
  {
    id: "failure-rules",
    labelKey: "failureRulesConfig",
    icon: CircleAlert,
    category: "configCategoryReliability",
  },
  {
    id: "affinity-migration",
    labelKey: "affinityMigrationConfig",
    icon: Shuffle,
    category: "configCategoryReliability",
  },
];

const DETAIL_CATEGORY_ORDER: UpstreamDetailCategory[] = [
  "configCategoryBasic",
  "configCategoryStrategy",
  "configCategoryReliability",
];

// Maps each section id to its self-saving form component (Phase B2). Each
// component renders its own titled card (SectionForm shell or, for diagnostics,
// a plain card), owns its react-hook-form instance, and persists a partial PUT.
const SECTION_COMPONENTS: Record<string, ComponentType<{ upstream: Upstream }>> = {
  "basic-name": BasicNameSection,
  "basic-profile": BasicProfileSection,
  "basic-route-endpoint": BasicRouteEndpointSection,
  "basic-api-key": BasicApiKeySection,
  "basic-diagnostics": BasicDiagnosticsSection,
  "priority-weight": PriorityWeightSection,
  "model-routing": ModelRoutingSection,
  "billing-multipliers": BillingMultipliersSection,
  "spending-quota": SpendingQuotaSection,
  "capacity-control": CapacityControlSection,
  "circuit-breaker": CircuitBreakerSection,
  "failure-rules": FailureRulesSection,
  "affinity-migration": AffinityMigrationSection,
};

export default function UpstreamDetailPage() {
  const params = useParams<{ id: string }>();
  const upstreamId = params.id;
  const t = useTranslations("upstreams");

  const { data: upstream, isLoading, error } = useUpstream(upstreamId);
  const notFound = error instanceof ApiError && error.status === 404;

  const groupedSections = DETAIL_CATEGORY_ORDER.map((category) => ({
    category,
    sections: UPSTREAM_DETAIL_SECTIONS.filter((section) => section.category === category),
  })).filter((group) => group.sections.length > 0);

  return (
    <>
      <Topbar title={t("detailTitle")} />

      <PageShell maxWidth="7xl">
        <Button variant="ghost" size="sm" className="w-fit gap-2 text-muted-foreground" asChild>
          <Link href="/upstreams">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("backToUpstreams")}
          </Link>
        </Button>

        {notFound ? (
          <Card variant="outlined" className="border-divider bg-surface-200/70">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <h2 className="type-title-medium text-foreground">{t("upstreamNotFound")}</h2>
              <p className="type-body-medium text-muted-foreground">{t("upstreamNotFoundHint")}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <PageHeader
              icon={Server}
              title={isLoading ? "" : (upstream?.name ?? upstreamId)}
              description={isLoading ? undefined : upstream?.base_url}
            />

            <div className="flex flex-col gap-6 lg:flex-row">
              <aside className="hidden lg:block lg:w-56 lg:shrink-0">
                <nav
                  aria-label={t("detailTitle")}
                  className="sticky top-14 space-y-4 rounded-cf-md border border-divider bg-surface-200/55 p-3"
                >
                  {groupedSections.map((group) => (
                    <div key={group.category} className="space-y-1">
                      <p className="type-caption px-2 text-muted-foreground">{t(group.category)}</p>
                      {group.sections.map((section) => (
                        <a
                          key={section.id}
                          href={`#${section.id}`}
                          className="flex items-center gap-2 rounded-cf-sm px-2 py-1.5 text-sm text-muted-foreground transition-colors duration-cf-fast hover:bg-surface-300/65 hover:text-foreground"
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
                {UPSTREAM_DETAIL_SECTIONS.map((section) => {
                  const SectionComponent = SECTION_COMPONENTS[section.id];
                  return (
                    <section key={section.id} id={section.id} className="scroll-mt-14">
                      {isLoading || !upstream ? (
                        <Card variant="outlined" className="border-divider bg-surface-200/70">
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
                        <SectionComponent key={upstream.id} upstream={upstream} />
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
