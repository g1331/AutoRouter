"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import { createApiClient } from "@/lib/api";
import { useRouter } from "@/i18n/navigation";
import { ArrowRight, KeyRound, Zap, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/language-switcher";

/**
 * Cassette Futurism Login Page
 *
 * Terminal-style login with:
 * - CRT scanline and noise effects
 * - Amber text on deep black
 * - Glowing accents and borders
 * - Blinking cursor animation
 */
export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setToken, token } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  const t = useTranslations("auth");
  const tCommon = useTranslations("common");

  useEffect(() => {
    if (token) {
      const redirect = searchParams.get("redirect") || "/dashboard";
      router.push(redirect);
    }
  }, [token, router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim()) {
      setError(t("tokenPlaceholder"));
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const tempClient = createApiClient({ getToken: () => inputValue });
      await tempClient.get("/admin/keys?page=1&page_size=1");
      setToken(inputValue);
      toast.success(t("loginSuccess"));
      const redirect = searchParams.get("redirect") || "/dashboard";
      router.push(redirect);
    } catch {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("admin_token");
      }
      setError(t("invalidToken"));
      toast.error(t("invalidToken"));
    } finally {
      setIsLoading(false);
    }
  };

  if (token) return null;

  return (
    <div className="cf-noise min-h-screen grid place-items-center px-6 py-12 bg-black-900">
      {/* CRT Scanlines overlay */}
      <div className="cf-scanlines fixed inset-0 pointer-events-none" />

      {/* Language Switcher - Top Right */}
      <div className="fixed top-4 right-4 z-20">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Terminal Window */}
        <div className="cf-panel bg-black-900/80 backdrop-blur-xs rounded-cf-md border-2 border-amber-500/80 shadow-cf-glow overflow-hidden">
          {/* Terminal Header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-black-900 border-b border-amber-500/50">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-status-error" />
              <div className="w-3 h-3 rounded-full bg-status-warning" />
              <div className="w-3 h-3 rounded-full bg-status-success" />
            </div>
            <span className="flex-1 text-center font-mono text-xs text-amber-700 tracking-wider">
              {t("terminalTitle")}
            </span>
          </div>

          {/* Terminal Content */}
          <div className="p-6">
            {/* Logo & Brand */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-cf-sm bg-amber-500 flex items-center justify-center shadow-cf-glow-subtle">
                <Zap
                  className="w-6 h-6 text-black-900"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
              </div>
              <div>
                <h1 className="font-mono text-lg font-medium text-amber-500 tracking-wide cf-glow-text">
                  {t("title")}
                </h1>
                <p className="font-mono text-xs text-amber-700">
                  {t("subtitle").toUpperCase()}
                </p>
              </div>
            </div>

            {/* System Message */}
            <div className="mb-6 font-mono text-sm">
              <div className="flex items-center gap-2 text-amber-700 mb-1">
                <Terminal className="w-4 h-4" aria-hidden="true" />
                <span>{t("systemMessage").toUpperCase()}</span>
              </div>
              <p className="text-amber-500 pl-6">
                {">"} {t("authRequired")}
                <span className="cf-cursor-blink">_</span>
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="admin-token"
                  className="block font-mono text-xs uppercase tracking-wider text-amber-700 mb-2"
                >
                  {t("adminToken")}
                </label>
                <div className="relative">
                  <KeyRound
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-700 pointer-events-none"
                    aria-hidden="true"
                  />
                  <Input
                    id="admin-token"
                    type="password"
                    placeholder={t("tokenPlaceholder")}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    disabled={isLoading}
                    className="pl-10"
                    aria-invalid={!!error}
                    aria-describedby={error ? "token-error" : undefined}
                  />
                </div>
                {error && (
                  <p
                    id="token-error"
                    className="mt-2 font-mono text-xs text-status-error"
                    role="alert"
                  >
                    [ERROR] {error}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full gap-2"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black-900/30 border-t-black-900 rounded-full animate-spin" />
                    {tCommon("loading")}
                  </>
                ) : (
                  <>
                    {t("loginButton")}
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>

            {/* Help Text */}
            <div className="mt-6 pt-4 border-t border-dashed border-divider">
              <p className="font-mono text-xs text-amber-700">
                <span className="text-amber-500">[INFO]</span> {t("tokenInfo")}
              </p>
            </div>
          </div>

          {/* Terminal Footer */}
          <div className="px-4 py-2 bg-black-900 border-t border-amber-500/50">
            <div className="flex items-center justify-between font-mono text-xs text-amber-700">
              <span>{tCommon("sysReady")}</span>
              <span className="text-status-success">{tCommon("online").toUpperCase()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
