"use client";

import { useTranslations } from "next-intl";
import { Topbar } from "@/components/admin/topbar";
import { BackgroundSyncTasksPanel } from "@/components/admin/background-sync-tasks-panel";

export default function BackgroundSyncPage() {
  const t = useTranslations("backgroundSync");

  return (
    <>
      <Topbar title={t("pageTitle")} />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <BackgroundSyncTasksPanel />
      </div>
    </>
  );
}
