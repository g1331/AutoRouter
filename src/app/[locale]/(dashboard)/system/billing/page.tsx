"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";

import { useUsdFormatter } from "@/components/admin/billing/billing-format";
import { BillingLogsCard } from "@/components/admin/billing/billing-logs-card";
import { BillingSummaryCards } from "@/components/admin/billing/billing-summary-cards";
import { OverrideResetDialog } from "@/components/admin/billing/override-reset-dialog";
import { PriceCatalogSection } from "@/components/admin/billing/price-catalog-section";
import { UnresolvedModelsSection } from "@/components/admin/billing/unresolved-models-section";
import { PageShell } from "@/components/admin/page-shell";
import { Topbar } from "@/components/admin/topbar";
import { useBackgroundSyncTasks } from "@/hooks/use-background-sync";
import {
  useBillingManualOverrides,
  useBillingOverview,
  useBillingUnresolvedModels,
  useResetBillingManualOverrides,
  useSyncBillingPrices,
} from "@/hooks/use-billing";
import { useContainerMorph } from "@/hooks/use-container-morph";
import type { BillingManualOverride } from "@/types/api";

export default function BillingPage() {
  const t = useTranslations("billing");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const usd = useUsdFormatter(locale);

  const overview = useBillingOverview();
  const unresolved = useBillingUnresolvedModels();
  const manualOverrides = useBillingManualOverrides();
  const backgroundTasks = useBackgroundSyncTasks();
  const syncPrices = useSyncBillingPrices();
  const resetOverrides = useResetBillingManualOverrides();

  const [selectedResetModels, setSelectedResetModels] = useState<string[]>([]);
  const [resetDialogTargets, setResetDialogTargets] = useState<string[] | null>(null);
  const [recentlySavedModel, setRecentlySavedModel] = useState<string | null>(null);

  // 容器变形动画：单行重置以该行的重置按钮为源、展开收回；批量重置无单一源，
  // 弹窗单独淡入（hook 对 source 为空安全降级）。
  const { startMorph, canMorph } = useContainerMorph();
  const morphSourceRef = useRef<HTMLElement | null>(null);
  const priceCatalogRef = useRef<HTMLDivElement | null>(null);

  const manualOverrideMap = useMemo(() => {
    const map = new Map<string, BillingManualOverride>();
    for (const item of manualOverrides.data?.items ?? []) {
      map.set(item.model, item);
    }
    return map;
  }, [manualOverrides.data]);

  useEffect(() => {
    if (!recentlySavedModel) {
      return;
    }
    const timer = window.setTimeout(() => setRecentlySavedModel(null), 4500);
    return () => window.clearTimeout(timer);
  }, [recentlySavedModel]);

  const scrollToPriceCatalog = () => {
    priceCatalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleOverrideSaved = (model: string) => {
    setRecentlySavedModel(model);
    scrollToPriceCatalog();
  };

  const openResetDialog = (models: string[], source?: HTMLElement | null) => {
    const normalized = [...new Set(models.map((m) => m.trim()).filter(Boolean))];
    if (normalized.length === 0) {
      return;
    }
    morphSourceRef.current = source ?? null;
    startMorph(() => setResetDialogTargets(normalized), {
      source: source ?? null,
      name: "morph-billing-override-reset",
      mode: "enter",
    });
  };

  const closeResetDialog = () =>
    startMorph(() => setResetDialogTargets(null), {
      source: morphSourceRef.current,
      name: "morph-billing-override-reset",
      mode: "exit",
    });

  const handleConfirmReset = async () => {
    if (!resetDialogTargets || resetOverrides.isPending) {
      return;
    }
    const targets = resetDialogTargets;
    await resetOverrides.mutateAsync(targets);
    setSelectedResetModels((prev) => prev.filter((m) => !targets.includes(m)));
    closeResetDialog();
  };

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <PageShell>
        <BillingSummaryCards
          t={t}
          locale={locale}
          usd={usd}
          overview={overview}
          backgroundTasks={backgroundTasks}
          syncPrices={syncPrices}
        />

        <UnresolvedModelsSection
          unresolved={unresolved}
          t={t}
          tCommon={tCommon}
          onOverrideSaved={handleOverrideSaved}
        />

        <PriceCatalogSection
          t={t}
          tCommon={tCommon}
          locale={locale}
          priceCatalogRef={priceCatalogRef}
          recentlySavedModel={recentlySavedModel}
          setRecentlySavedModel={setRecentlySavedModel}
          selectedResetModels={selectedResetModels}
          setSelectedResetModels={setSelectedResetModels}
          openResetDialog={openResetDialog}
          resetOverrides={resetOverrides}
        />

        <BillingLogsCard t={t} />
      </PageShell>

      <OverrideResetDialog
        resetDialogTargets={resetDialogTargets}
        closeResetDialog={closeResetDialog}
        canMorph={canMorph}
        manualOverrideMap={manualOverrideMap}
        resetOverrides={resetOverrides}
        onConfirmReset={handleConfirmReset}
        t={t}
        tCommon={tCommon}
      />
    </>
  );
}
