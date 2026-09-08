"use client";

import { useTranslations } from "next-intl";

import { Topbar } from "@/components/admin/topbar";
import { PageShell } from "@/components/admin/page-shell";
import { PageHeader } from "@/components/admin/page-header";
import { PortalChangePasswordForm } from "@/components/portal/portal-change-password-form";

export default function PortalPasswordPage() {
  const t = useTranslations("portal");

  return (
    <>
      <Topbar title={t("password.pageTitle")} />

      <PageShell maxWidth="2xl">
        <PageHeader title={t("password.pageTitle")} />
        <PortalChangePasswordForm />
      </PageShell>
    </>
  );
}
