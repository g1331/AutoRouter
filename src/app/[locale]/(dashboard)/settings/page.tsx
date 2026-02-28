"use client";

import { ArrowLeftRight, ChevronRight, Globe, LogOut, Moon, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Topbar } from "@/components/admin/topbar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { logout } = useAuth();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tTheme = useTranslations("theme");
  const tLang = useTranslations("language");
  const tCompensation = useTranslations("compensation");

  const settingsItems = [
    {
      icon: Globe,
      title: tLang("current"),
      description: tLang("switch"),
      action: <LanguageSwitcher />,
    },
    {
      icon: Moon,
      title: tTheme("toggle"),
      description: tTheme("dark"),
      action: <ThemeToggle />,
    },
  ];

  const systemLinks = [
    {
      href: "/system/header-compensation",
      icon: ArrowLeftRight,
      title: tCompensation("title"),
      description: tCompensation("managementDesc"),
    },
  ];

  return (
    <>
      <Topbar title={t("settings")} />

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <Card variant="outlined" className="border-divider bg-surface-200/70">
          <CardContent className="space-y-2 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-amber-500">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              <span className="type-label-medium">{t("settings")}</span>
            </div>
            <p className="type-body-medium text-muted-foreground">{tCommon("adminConsole")}</p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {settingsItems.map((item) => {
            const Icon = item.icon;
            return (
              <Card
                key={item.title}
                variant="outlined"
                className="border-divider bg-surface-200/70"
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-cf-sm border border-divider bg-surface-300 text-amber-500">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <h3 className="type-body-medium text-foreground">{item.title}</h3>
                        <p className="type-caption text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                    <div className="self-end sm:self-auto">{item.action}</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {systemLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="block">
                <Card
                  variant="outlined"
                  className={cn(
                    "group border-divider bg-surface-200/70 transition-colors",
                    "hover:bg-surface-200/85"
                  )}
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-cf-sm border border-divider bg-surface-300 text-amber-500">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="type-body-medium text-foreground">{item.title}</h3>
                          <p className="type-caption text-muted-foreground">{item.description}</p>
                        </div>
                      </div>

                      <ChevronRight
                        className="mt-2 h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                        aria-hidden="true"
                      />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}

          <Card variant="outlined" className="border-status-error/35 bg-surface-200/70">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-cf-sm border border-status-error/35 bg-status-error-muted text-status-error">
                    <LogOut className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="type-body-medium text-status-error">{t("logout")}</h3>
                    <p className="type-caption text-muted-foreground">{tCommon("logout")}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={logout}
                  className={cn(
                    "border-status-error/50 text-status-error hover:bg-status-error-muted hover:text-status-error"
                  )}
                >
                  {t("logout")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
