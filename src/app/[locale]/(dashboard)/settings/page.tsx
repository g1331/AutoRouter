"use client";

import { useTranslations } from "next-intl";
import { LogOut, Globe, Moon } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";

/**
 * Settings Page
 *
 * User preferences and system settings:
 * - Language selection
 * - Theme toggle (light/dark)
 * - Logout
 */
export default function SettingsPage() {
  const { logout } = useAuth();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tTheme = useTranslations("theme");
  const tLang = useTranslations("language");

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

  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      {/* Settings List */}
      <div className="space-y-4">
        {settingsItems.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} variant="outlined">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-cf-sm bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="font-mono text-sm font-medium text-amber-500">{item.title}</h3>
                      <p className="font-sans text-xs text-amber-700 mt-0.5">{item.description}</p>
                    </div>
                  </div>
                  {item.action}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Logout Button */}
        <Card variant="outlined" className="border-status-error/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-cf-sm bg-status-error/10 border border-status-error/30 flex items-center justify-center">
                  <LogOut className="w-5 h-5 text-status-error" />
                </div>
                <div>
                  <h3 className="font-mono text-sm font-medium text-status-error">{t("logout")}</h3>
                  <p className="font-sans text-xs text-amber-700 mt-0.5">{tCommon("logout")}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                className={cn(
                  "border-status-error text-status-error hover:bg-status-error-muted hover:text-status-error",
                  "font-mono text-xs"
                )}
              >
                {t("logout")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
