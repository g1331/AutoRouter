"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import { createApiClient } from "@/lib/api";
import { useRouter } from "@/i18n/navigation";
import { ArrowRight, KeyRound, Zap, Terminal, Cpu, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";

/**
 * Cassette Futurism Login Page
 *
 * Enhanced terminal-style login with:
 * - CRT boot sequence animation
 * - System diagnostics display
 * - Phosphor glow effects
 * - Retro grid background
 * - Glitch effects on interaction
 */

// Boot sequence messages for terminal effect
const BOOT_MESSAGES = [
  { text: "INITIALIZING SYSTEM...", delay: 0 },
  { text: "LOADING KERNEL v4.2.1", delay: 300 },
  { text: "MEMORY CHECK: 64KB OK", delay: 600 },
  { text: "NETWORK ADAPTER: ONLINE", delay: 900 },
  { text: "ENCRYPTION MODULE: ACTIVE", delay: 1200 },
  { text: "AUTHENTICATION READY", delay: 1500 },
];

/**
 * Terminal boot sequence component
 */
function BootSequence({ onComplete }: { onComplete: () => void }) {
  // Check for reduced motion preference once on mount
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
      // Skip boot sequence immediately if user prefers reduced motion
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
    } else {
      const completeTimer = setTimeout(onComplete, 500);
      return () => clearTimeout(completeTimer);
    }
  }, [visibleLines, onComplete]);

  return (
    <div
      className="font-mono text-xs space-y-1"
      role="status"
      aria-live="polite"
      aria-label="System initialization progress"
    >
      {BOOT_MESSAGES.slice(0, visibleLines).map((msg, idx) => (
        <div
          key={idx}
          className={cn(
            "flex items-center gap-2 cf-stagger-reveal",
            idx === visibleLines - 1 ? "text-amber-500" : "text-amber-700"
          )}
          style={{ animationDelay: `${idx * 100}ms` }}
        >
          <span className="text-status-success" aria-label="Status OK">
            [OK]
          </span>
          <span>{msg.text}</span>
        </div>
      ))}
      {visibleLines < BOOT_MESSAGES.length && (
        <div className="flex items-center gap-2 text-amber-500">
          <span className="animate-pulse" aria-label="Loading">
            [ ]
          </span>
          <span>{BOOT_MESSAGES[visibleLines]?.text || "..."}</span>
          <span className="cf-cursor-blink" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

/**
 * System status indicators
 */
function SystemStatus() {
  return (
    <div
      className="flex items-center gap-4 font-mono text-[10px] text-amber-700"
      role="status"
      aria-label="System status"
    >
      <div className="flex items-center gap-1.5">
        <Cpu className="w-3 h-3" aria-hidden="true" />
        <span>CPU: OK</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Shield className="w-3 h-3" aria-hidden="true" />
        <span>SEC: ACTIVE</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div
          className="cf-status-led cf-status-led-online"
          role="img"
          aria-label="Online indicator"
        />
        <span>NET: ONLINE</span>
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

  // Handle boot sequence completion
  const handleBootComplete = useCallback(() => {
    setBootComplete(true);
    setTimeout(() => setShowForm(true), 300);
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

  if (token) return null;

  return (
    <div className="cf-noise cf-retro-grid min-h-screen grid place-items-center px-6 py-12 bg-black-900">
      {/* CRT Scanlines overlay */}
      <div className="cf-scanlines fixed inset-0 pointer-events-none" />

      {/* Vignette effect for CRT authenticity */}
      <div className="cf-vignette fixed inset-0 pointer-events-none" />

      {/* Language Switcher - Top Right */}
      <div className="fixed top-4 right-4 z-20">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Terminal Window with boot sequence */}
        <div
          className={cn(
            "cf-panel bg-black-900/90 backdrop-blur-sm rounded-cf-md",
            "border-2 border-amber-500/80 shadow-cf-glow-medium overflow-hidden",
            "cf-boot-sequence"
          )}
        >
          {/* Terminal Header with LED indicators */}
          <div className="flex items-center gap-2 px-4 py-3 bg-black-900 border-b border-amber-500/50">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-status-error shadow-[0_0_4px] shadow-status-error/50" />
              <div className="w-3 h-3 rounded-full bg-status-warning shadow-[0_0_4px] shadow-status-warning/50" />
              <div className="w-3 h-3 rounded-full bg-status-success shadow-[0_0_4px] shadow-status-success/50" />
            </div>
            <span className="flex-1 text-center font-mono text-xs text-amber-700 tracking-wider">
              {t("terminalTitle")}
            </span>
          </div>

          {/* Terminal Content */}
          <div className="p-6">
            {/* Boot Sequence Animation */}
            {!bootComplete && (
              <div className="mb-6 p-4 bg-black-900/50 rounded-cf-sm border border-amber-500/30">
                <BootSequence onComplete={handleBootComplete} />
              </div>
            )}

            {/* Main Content (shown after boot) */}
            <div
              className={cn(
                "transition-all duration-500",
                showForm ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              )}
            >
              {/* Logo & Brand */}
              <div className="flex items-center gap-3 mb-6">
                <div
                  className={cn(
                    "w-14 h-14 rounded-cf-sm flex items-center justify-center",
                    "bg-gradient-to-br from-amber-500 to-amber-600",
                    "shadow-cf-glow-medium cf-glitch"
                  )}
                >
                  <Zap className="w-7 h-7 text-black-900" strokeWidth={2.5} aria-hidden="true" />
                </div>
                <div>
                  <h1 className="font-mono text-xl font-medium text-amber-500 tracking-wide cf-phosphor-trail">
                    {t("title")}
                  </h1>
                  <p className="font-mono text-xs text-amber-700">{t("subtitle").toUpperCase()}</p>
                </div>
              </div>

              {/* System Status Bar */}
              <div className="mb-6 p-2 bg-black-900/50 rounded-cf-sm border border-amber-500/20">
                <SystemStatus />
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
                  <div className="relative group">
                    <KeyRound
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-700 pointer-events-none group-focus-within:text-amber-500 transition-colors"
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
                    <p
                      id="token-error"
                      className="mt-2 font-mono text-xs text-status-error cf-glitch"
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
                  className="w-full gap-2 group"
                  disabled={isLoading || !showForm}
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black-900/30 border-t-black-900 rounded-full animate-spin" />
                      {tCommon("loading")}
                    </>
                  ) : (
                    <>
                      {t("loginButton")}
                      <ArrowRight
                        className="w-4 h-4 group-hover:translate-x-1 transition-transform"
                        aria-hidden="true"
                      />
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
          </div>

          {/* Terminal Footer with scanning animation */}
          <div className="px-4 py-2 bg-black-900 border-t border-amber-500/50 relative overflow-hidden">
            <div className="flex items-center justify-between font-mono text-xs text-amber-700 relative z-10">
              <span>{tCommon("sysReady")}</span>
              <div className="flex items-center gap-2">
                <div className="cf-status-led cf-status-led-online" />
                <span className="text-status-success">{tCommon("online").toUpperCase()}</span>
              </div>
            </div>
            {/* Scanning line effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent animate-shimmer" />
          </div>
        </div>

        {/* Decorative corner brackets */}
        <div className="absolute -top-2 -left-2 w-6 h-6 border-t-2 border-l-2 border-amber-500/40" />
        <div className="absolute -top-2 -right-2 w-6 h-6 border-t-2 border-r-2 border-amber-500/40" />
        <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-2 border-l-2 border-amber-500/40" />
        <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-2 border-r-2 border-amber-500/40" />
      </div>
    </div>
  );
}
