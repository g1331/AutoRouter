"use client";

import { useTranslations } from "next-intl";

import { Topbar } from "@/components/admin/topbar";
import { PortalChangePasswordForm } from "@/components/portal/portal-change-password-form";

export default function PortalPasswordPage() {
  const t = useTranslations("portal");

  return (
    <>
      <Topbar title={t("password.pageTitle")} />

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <PortalChangePasswordForm />
      </div>
    </>
  );
}
