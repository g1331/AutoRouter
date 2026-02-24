"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { ArrowRight, Cpu, KeyRound, Shield, Terminal } from "lucide-react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createApiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";

const BOOT_MESSAGES = [
  { text: "Preparing admin workspace", delay: 0 },
  { text: "Checking gateway services", delay: 260 },
  { text: "Verifying encryption module", delay: 560 },
  { text: "Loading routing metadata", delay: 900 },
  { text: "Authentication channel ready", delay: 1250 },
];

function BootSequence({ onComplete }: { onComplete: () => void }) {
  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const [visibleLines, setVisibleLines] = useState<number>(
    prefersReducedMotion ? BOOT_MESSAGES.length : 0
  );

  useEffect(() => {
    if (prefersReducedMotion) {
      onComplete();
      return;
    }

    if (visibleLines < BOOT_MESSAGES.length) {
      const currentDelay = BOOT_MESSAGES[visibleLines]?.delay ?? 0;
      const previousDelay = BOOT_MESSAGES[visibleLines - 1]?.delay ?? 0;
      const stepDelay = Math.max(0, currentDelay - previousDelay);
      const timer = setTimeout(() => {
        setVisibleLines((prev) => prev + 1);
      }, stepDelay);
      return () => clearTimeout(timer);
    }

    const completeTimer = setTimeout(onComplete, 300);
    return () => clearTimeout(completeTimer);
  }, [onComplete, prefersReducedMotion, visibleLines]);

  return (
    <div className="space-y-1.5 font-mono text-xs" role="status" aria-live="polite">
      {BOOT_MESSAGES.slice(0, visibleLines).map((message, index) => (
        <div
          key={message.text}
          className={cn(
            "flex items-center gap-2",
            index === visibleLines - 1 ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <span className="text-status-success">[OK]</span>
          <span>{message.text}</span>
        </div>
      ))}
      {visibleLines < BOOT_MESSAGES.length && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-status-warning">[...]</span>
          <span>{BOOT_MESSAGES[visibleLines]?.text || "..."}</span>
          <span
            className="inline-block h-3 w-1 animate-pulse rounded-[2px] bg-muted-foreground"
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}

function SystemStatus() {
  return (
    <div
      className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3"
      role="status"
      aria-label="System status"
    >
      <div className="inline-flex items-center gap-2 rounded-[8px] border border-divider bg-surface-300/70 px-2.5 py-1.5 font-mono text-muted-foreground">
        <Cpu className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
        <span>CPU READY</span>
      </div>
      <div className="inline-flex items-center gap-2 rounded-[8px] border border-divider bg-surface-300/70 px-2.5 py-1.5 font-mono text-muted-foreground">
        <Shield className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
        <span>SECURE MODE</span>
      </div>
      <div className="inline-flex items-center gap-2 rounded-[8px] border border-status-success/35 bg-status-success-muted px-2.5 py-1.5 font-mono text-status-success">
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        <span>NETWORK ONLINE</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setToken, token } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");
  const [bootComplete, setBootComplete] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const t = useTranslations("auth");
  const tCommon = useTranslations("common");

  const handleBootComplete = useCallback(() => {
    setBootComplete(true);
    setTimeout(() => setShowForm(true), 180);
  }, []);

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

  if (token) {
    return null;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        aria-hidden="true"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 18%, rgba(201,157,82,0.14), transparent 44%), radial-gradient(circle at 78% 4%, rgba(89,111,131,0.16), transparent 34%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 opacity-35" aria-hidden="true">
        <div className="h-full w-full [background-image:linear-gradient(to_right,rgba(134,146,158,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(134,146,158,0.1)_1px,transparent_1px)] [background-size:44px_44px]" />
      </div>

      <div className="fixed right-4 top-4 z-30">
        <LanguageSwitcher />
      </div>

      <div className="relative z-10 grid min-h-screen place-items-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card/90 shadow-[var(--vr-shadow-lg)] backdrop-blur">
          <div className="border-b border-divider px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="type-title-large text-foreground">{t("title")}</h1>
                <p className="type-body-small mt-1 text-muted-foreground">{t("subtitle")}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-status-success/35 bg-status-success-muted px-2.5 py-1 font-mono text-[11px] text-status-success">
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                SECURE
              </span>
            </div>
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            {!bootComplete && (
              <div className="rounded-[10px] border border-divider bg-surface-300/70 px-3.5 py-3">
                <BootSequence onComplete={handleBootComplete} />
              </div>
            )}

            <div
              className={cn(
                "space-y-5 transition-all duration-300",
                showForm ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              )}
            >
              <SystemStatus />

              <div className="rounded-[10px] border border-divider bg-surface-300/55 px-3.5 py-3">
                <div className="mb-1.5 flex items-center gap-2 text-muted-foreground">
                  <Terminal className="h-4 w-4 text-amber-500" aria-hidden="true" />
                  <span className="type-label-small">{t("systemMessage")}</span>
                </div>
                <p className="type-body-small pl-6 text-foreground">
                  {">"} {t("authRequired")}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="admin-token" className="type-label-small text-muted-foreground">
                    {t("adminToken")}
                  </label>
                  <div className="relative">
                    <KeyRound
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="admin-token"
                      type="password"
                      placeholder={t("tokenPlaceholder")}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      disabled={isLoading || !showForm}
                      className="pl-10"
                      aria-invalid={!!error}
                      aria-describedby={error ? "token-error" : undefined}
                    />
                  </div>
                  {error && (
                    <p id="token-error" className="type-body-small text-status-error" role="alert">
                      {error}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full gap-2"
                  disabled={isLoading || !showForm}
                >
                  {isLoading ? (
                    <>
                      <span
                        className="h-4 w-4 animate-spin rounded-full border-2 border-black/25 border-t-black"
                        aria-hidden="true"
                      />
                      {tCommon("loading")}
                    </>
                  ) : (
                    <>
                      {t("loginButton")}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </form>

              <p className="type-caption border-t border-dashed border-divider pt-3 text-muted-foreground">
                {t("tokenInfo")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
