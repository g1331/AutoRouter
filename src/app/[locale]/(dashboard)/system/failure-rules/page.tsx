"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageHeader } from "@/components/admin/page-header";
import { PageShell } from "@/components/admin/page-shell";
import { Topbar } from "@/components/admin/topbar";
import { UpstreamFailureRulesEditor } from "@/components/admin/upstream-failure-rules-editor";

export default function GlobalFailureRulesPage() {
  const t = useTranslations("upstreamFailureRules");

  return (
    <>
      <Topbar title={t("title")} />

      <PageShell maxWidth="4xl">
        <PageHeader icon={ShieldAlert} title={t("title")} description={t("description")} />

        <section className="space-y-3" aria-label={t("editorLabel")}>
          <div className="space-y-1">
            <h2 className="type-title-medium text-foreground">{t("editorTitle")}</h2>
            <p className="type-caption text-muted-foreground">{t("editorDescription")}</p>
          </div>
          <UpstreamFailureRulesEditor scope="global" />
        </section>
      </PageShell>
    </>
  );
}
