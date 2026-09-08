"use client";

import { useTranslations } from "next-intl";
import { Topbar } from "@/components/admin/topbar";
import { PageShell } from "@/components/admin/page-shell";
import { PageHeader } from "@/components/admin/page-header";
import { BackgroundSyncTasksPanel } from "@/components/admin/background-sync-tasks-panel";

export default function BackgroundSyncPage() {
  const t = useTranslations("backgroundSync");

  return (
    <>
      <Topbar title={t("pageTitle")} />
      <PageShell maxWidth="7xl">
        <PageHeader title={t("pageTitle")} />
        <BackgroundSyncTasksPanel />
      </PageShell>
    </>
  );
}
