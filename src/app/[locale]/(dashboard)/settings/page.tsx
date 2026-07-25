"use client";

import {
  ArrowUpRight,
  ArrowLeftRight,
  DatabaseZap,
  Globe,
  Github,
  LogOut,
  Moon,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  TerminalSquare,
  Users,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";
import { PageHeader } from "@/components/admin/page-header";
import { PageShell } from "@/components/admin/page-shell";
import { Topbar } from "@/components/admin/topbar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconBox } from "@/components/ui/icon-box";
import { Link } from "@/i18n/navigation";
import { APP_REPOSITORY_URL, APP_VERSION_TAG } from "@/lib/app-version";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { logout } = useAuth();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tTheme = useTranslations("theme");
  const tLang = useTranslations("language");
  const tCompensation = useTranslations("compensation");
  const tBilling = useTranslations("billing");
  const tBackgroundSync = useTranslations("backgroundSync");
  const tTrafficRecording = useTranslations("trafficRecording");
  const tRepository = useTranslations("repository");
  const tFailureRules = useTranslations("upstreamFailureRules");
  const tUsers = useTranslations("users");
  const tCliproxy = useTranslations("cliproxy");

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
      href: "/system/users",
      icon: Users,
      title: t("users"),
      description: tUsers("managementDesc"),
    },
    {
      href: "/system/billing",
      icon: Wallet,
      title: tBilling("title"),
      description: tBilling("managementDesc"),
    },
    {
      href: "/system/background-sync",
      icon: RefreshCw,
      title: tBackgroundSync("title"),
      description: tBackgroundSync("panelDescription"),
    },
    {
      href: "/system/traffic-recording",
      icon: DatabaseZap,
      title: tTrafficRecording("title"),
      description: tTrafficRecording("settingsDescription"),
    },
    {
      href: "/system/failure-rules",
      icon: ShieldAlert,
      title: tFailureRules("title"),
      description: tFailureRules("settingsDescription"),
    },
    {
      href: "/system/header-compensation",
      icon: ArrowLeftRight,
      title: tCompensation("title"),
      description: tCompensation("managementDesc"),
    },
    {
      href: "/system/cliproxy",
      icon: TerminalSquare,
      title: t("cliproxy"),
      description: tCliproxy("pageDescription"),
    },
  ];

  const externalLinks = [
    {
      href: APP_REPOSITORY_URL,
      icon: Github,
      title: tRepository("title"),
      description: tRepository("description"),
    },
  ];

  return (
    <>
      <Topbar title={t("settings")} />

      <PageShell maxWidth="4xl">
        <PageHeader
          icon={SlidersHorizontal}
          title={t("settings")}
          description={tCommon("adminConsole")}
        />

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
                      <IconBox size="md">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </IconBox>
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
                        <IconBox size="md" className="mt-0.5 flex-shrink-0">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </IconBox>
                        <div className="min-w-0">
                          <h3 className="type-body-medium text-foreground">{item.title}</h3>
                          <p className="type-caption text-muted-foreground">{item.description}</p>
                        </div>
                      </div>

                      <ArrowUpRight
                        className="mt-2 h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                        aria-hidden="true"
                      />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}

          {externalLinks.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                aria-label={tRepository("open")}
              >
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
                        <IconBox size="md" className="mt-0.5 flex-shrink-0">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </IconBox>
                        <div className="min-w-0">
                          <h3 className="type-body-medium text-foreground">{item.title}</h3>
                          <p className="type-caption text-muted-foreground">{item.description}</p>
                        </div>
                      </div>

                      <ArrowUpRight
                        className="mt-2 h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                        aria-hidden="true"
                      />
                    </div>
                  </CardContent>
                </Card>
              </a>
            );
          })}

          <Card variant="outlined" className="border-status-error/35 bg-surface-200/70">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <IconBox size="md" tone="error">
                    <LogOut className="h-5 w-5" aria-hidden="true" />
                  </IconBox>
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

          <div className="flex justify-center pt-1 md:hidden">
            <p className="type-caption text-muted-foreground">
              {tCommon("appName")} {APP_VERSION_TAG}
            </p>
          </div>
        </div>
      </PageShell>
    </>
  );
}
