"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { ArrowRight, KeyRound, User } from "lucide-react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

import { cn } from "@/lib/utils";
import { sanitizeRedirect } from "@/lib/utils/safe-redirect";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";

type LoginMode = "account" | "token";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setToken, token, principal } = useAuth();
  const [mode, setMode] = useState<LoginMode>("account");
  const [isLoading, setIsLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  const t = useTranslations("auth");
  const tCommon = useTranslations("common");

  useEffect(() => {
    if (token && principal) {
      const fallback = principal.role === "member" ? "/portal" : "/dashboard";
      const redirect = sanitizeRedirect(searchParams.get("redirect"), fallback);
      router.push(redirect);
    }
  }, [token, principal, router, searchParams]);

  const switchMode = (next: LoginMode) => {
    setMode(next);
    setError("");
  };

  // 登录后按角色分流落地页（决策九）：member 进入自助门户，
  // admin 与管理员令牌进入管理后台；显式 redirect 参数仍然优先。
  const completeLogin = (newToken: string, role: "admin" | "member") => {
    setToken(newToken);
    toast.success(t("loginSuccess"));
    const fallback = role === "member" ? "/portal" : "/dashboard";
    const redirect = sanitizeRedirect(searchParams.get("redirect"), fallback);
    router.push(redirect);
  };

  // 账号模式：调用 /api/auth/login 端点，凭用户名与密码换取 JWT。
  const handleAccountLogin = async () => {
    if (!username.trim() || !password) {
      setError(t("invalidCredentials"));
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          token: string;
          user: { role: "admin" | "member" };
        };
        completeLogin(data.token, data.user.role);
        return;
      }

      const message = response.status === 429 ? t("tooManyAttempts") : t("invalidCredentials");
      setError(message);
      toast.error(message);
    } catch {
      setError(t("loginFailed"));
      toast.error(t("loginFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // 令牌模式：用 ADMIN_TOKEN 向 /api/auth/token-login 换取短期会话 JWT。
  // ADMIN_TOKEN 原文只在此次请求体中提交、绝不落盘；换回的会话 JWT 由
  // completeLogin 持久化到 localStorage，从而令牌登录也能记住登录。
  const handleTokenLogin = async () => {
    if (!inputValue.trim()) {
      setError(t("tokenPlaceholder"));
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/token-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: inputValue.trim() }),
      });

      if (response.ok) {
        const data = (await response.json()) as { token: string };
        completeLogin(data.token, "admin");
        return;
      }

      const message = response.status === 429 ? t("tooManyAttempts") : t("invalidToken");
      setError(message);
      toast.error(message);
    } catch {
      setError(t("loginFailed"));
      toast.error(t("loginFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (mode === "account") {
      void handleAccountLogin();
    } else {
      void handleTokenLogin();
    }
  };

  if (token) {
    return null;
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <div className="fixed right-4 top-4 z-30">
        <LanguageSwitcher />
      </div>

      <div className="relative z-10 grid min-h-dvh place-items-center px-4 py-20 sm:px-6">
        <div className="w-full max-w-md overflow-hidden rounded-cf-md border border-border/60 bg-card shadow-[var(--vr-shadow-sm)]">
          <div className="border-b border-divider px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="type-title-large text-foreground">{t("title")}</h1>
                <p className="type-body-small mt-1 text-muted-foreground">{t("subtitle")}</p>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            <div className="space-y-5">
              <div role="tablist" aria-label={t("login")} className="grid grid-cols-2 gap-2">
                {[
                  { value: "account" as const, label: t("accountTab") },
                  { value: "token" as const, label: t("tokenTab") },
                ].map((tab) => {
                  const selected = mode === tab.value;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls={"login-panel"}
                      id={"login-tab-" + tab.value}
                      tabIndex={selected ? 0 : -1}
                      onKeyDown={(event) => {
                        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                          event.preventDefault();
                          const next =
                            event.key === "Home"
                              ? "account"
                              : event.key === "End"
                                ? "token"
                                : mode === "account"
                                  ? "token"
                                  : "account";
                          switchMode(next);
                          document.getElementById("login-tab-" + next)?.focus();
                        }
                      }}
                      onClick={() => switchMode(tab.value)}
                      disabled={isLoading}
                      className={cn(
                        "rounded-cf-md border px-3 py-2 text-center font-mono type-label-small transition-colors",
                        selected
                          ? "border-amber-500/55 bg-surface-300/80 text-foreground"
                          : "border-divider bg-surface-300/40 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <form
                id="login-panel"
                role="tabpanel"
                aria-labelledby={"login-tab-" + mode}
                key={mode}
                onSubmit={handleSubmit}
                className="content-enter space-y-4"
              >
                {mode === "account" ? (
                  <>
                    <div className="space-y-2">
                      <label
                        htmlFor="login-username"
                        className="type-label-small text-muted-foreground"
                      >
                        {t("username")}
                      </label>
                      <div className="relative">
                        <User
                          className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          id="login-username"
                          autoComplete="username"
                          placeholder={t("usernamePlaceholder")}
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          disabled={isLoading}
                          className="pl-10"
                          aria-invalid={!!error}
                          aria-describedby={error ? "login-error" : undefined}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="login-password"
                        className="type-label-small text-muted-foreground"
                      >
                        {t("password")}
                      </label>
                      <div className="relative">
                        <KeyRound
                          className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <PasswordInput
                          id="login-password"
                          allowPasswordManager
                          autoComplete="current-password"
                          placeholder={t("passwordPlaceholder")}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={isLoading}
                          className="pl-10"
                          aria-invalid={!!error}
                          aria-describedby={error ? "login-error" : undefined}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <label htmlFor="admin-token" className="type-label-small text-muted-foreground">
                      {t("adminToken")}
                    </label>
                    <div className="relative">
                      <KeyRound
                        className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <PasswordInput
                        id="admin-token"
                        allowPasswordManager
                        autoComplete="current-password"
                        placeholder={t("tokenPlaceholder")}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        disabled={isLoading}
                        className="pl-10"
                        aria-invalid={!!error}
                        aria-describedby={error ? "login-error" : undefined}
                      />
                    </div>
                  </div>
                )}

                {error && (
                  <p id="login-error" className="type-body-small text-status-error" role="alert">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full gap-2"
                  disabled={isLoading}
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
                {mode === "account" ? t("accountInfo") : t("tokenInfo")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
