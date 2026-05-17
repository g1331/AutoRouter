"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Topbar } from "@/components/admin/topbar";
import { UpstreamFailureRulesEditor } from "@/components/admin/upstream-failure-rules-editor";
import { Card, CardContent } from "@/components/ui/card";

export default function GlobalFailureRulesPage() {
  const t = useTranslations("upstreamFailureRules");

  return (
    <>
      <Topbar title={t("title")} />

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <Card variant="outlined" className="border-divider bg-surface-200/70">
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-amber-500">
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              <span className="type-label-medium">{t("title")}</span>
            </div>
            <p className="type-body-small text-muted-foreground">{t("description")}</p>
          </CardContent>
        </Card>

        <section className="space-y-3" aria-label={t("editorLabel")}>
          <div className="space-y-1">
            <h2 className="type-heading-small text-foreground">{t("editorTitle")}</h2>
            <p className="type-caption text-muted-foreground">{t("editorDescription")}</p>
          </div>
          <UpstreamFailureRulesEditor scope="global" />
        </section>
      </div>
    </>
  );
}
