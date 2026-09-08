"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, ExternalLink, Loader2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  CLIPROXY_OAUTH_POLL_TIMEOUT_MS,
  useCliproxyOAuthStatus,
  useInitiateCliproxyOAuthLogin,
  useSubmitCliproxyOAuthCallback,
} from "@/hooks/use-cliproxy";
import { CLIPROXY_PROVIDERS } from "@/types/cliproxy";
import type { CliproxyProvider } from "@/types/cliproxy";

interface CliproxyOAuthLoginDialogProps {
  instanceId: string;
  open: boolean;
  onClose: () => void;
}

const PROVIDER_LABEL_KEY: Record<CliproxyProvider, string> = {
  codex: "providerCodex",
  anthropic: "providerAnthropic",
  gemini: "providerGemini",
  xai: "providerXai",
  antigravity: "providerAntigravity",
  kimi: "providerKimi",
};

/**
 * OAuth 登录流程弹窗。
 *
 * 选择服务商发起登录，展示授权地址并轮询登录状态。后端不返回 device code
 * 与过期时间，过期以客户端固定超时为硬性截止。
 */
export function CliproxyOAuthLoginDialog({
  instanceId,
  open,
  onClose,
}: CliproxyOAuthLoginDialogProps) {
  const t = useTranslations("cliproxy");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();

  const [provider, setProvider] = useState<CliproxyProvider>("codex");
  const [session, setSession] = useState<{ url: string; state: string } | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("");
  const active = useRef(false);
  const completed = useRef(false);
  useEffect(() => {
    active.current = open;
    return () => {
      active.current = false;
    };
  }, [open, instanceId]);

  const initiateMutation = useInitiateCliproxyOAuthLogin();
  const callbackMutation = useSubmitCliproxyOAuthCallback();
  const statusQuery = useCliproxyOAuthStatus(
    instanceId,
    session?.state ?? null,
    open && Boolean(session) && !timedOut
  );
  const status = statusQuery.data?.status;

  useEffect(() => {
    if (!open || !session) {
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), CLIPROXY_OAUTH_POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [open, session]);

  useEffect(() => {
    if (open && status === "ok" && !completed.current) {
      completed.current = true;
      queryClient.invalidateQueries({ queryKey: ["cliproxy", "accounts"] });
      toast.success(t("oauthLoginSuccess"));
      onClose();
    }
  }, [open, status, queryClient, onClose, t]);

  const handleStart = async () => {
    if (initiateMutation.isPending) return;
    setTimedOut(false);
    try {
      const result = await initiateMutation.mutateAsync({ instanceId, provider });
      if (!active.current) return;
      setSession({ url: result.url, state: result.state });
    } catch (error) {
      if (!active.current) return;
      toast.error(
        t("oauthInitiateFailed", {
          message: error instanceof Error ? error.message : String(error),
        })
      );
    }
  };

  const handleRetry = () => {
    completed.current = false;
    setSession(null);
    setTimedOut(false);
    setCallbackUrl("");
  };

  const handleSubmitCallback = async () => {
    if (callbackMutation.isPending) return;
    if (!callbackUrl.trim()) {
      toast.error(t("oauthManualCallbackEmpty"));
      return;
    }
    try {
      await callbackMutation.mutateAsync({
        instanceId,
        provider,
        redirectUrl: callbackUrl.trim(),
      });
      if (active.current) onClose();
    } catch {
      // 错误已由 mutation 的 onError 提示
    }
  };

  const handleCopy = async () => {
    if (!session) {
      return;
    }
    try {
      await navigator.clipboard.writeText(session.url);
      if (active.current) toast.success(t("oauthCopied"), { id: "oauth-copy" });
    } catch {
      if (active.current) toast.error(t("oauthCopyFailed"), { id: "oauth-copy" });
    }
  };

  const failed = status === "error" || timedOut;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("oauthLoginTitle")}</DialogTitle>
          <DialogDescription>{t("oauthLoginDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!session ? (
            <div className="space-y-2">
              <p className="type-body-small text-muted-foreground">{t("oauthSelectProvider")}</p>
              <Select
                value={provider}
                disabled={initiateMutation.isPending}
                onValueChange={(value) => setProvider(value as CliproxyProvider)}
              >
                <SelectTrigger aria-label={t("oauthSelectProvider")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIPROXY_PROVIDERS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {t(PROVIDER_LABEL_KEY[item])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="type-body-small text-muted-foreground">{t("oauthAuthUrlLabel")}</p>
                <code className="block break-all rounded-cf-sm border border-transparent bg-surface-400 p-2 type-body-small font-mono">
                  {session.url}
                </code>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={session.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t("oauthOpenAuthUrl")}
                  </a>
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="mr-2 h-4 w-4" />
                  {t("oauthCopyAuthUrl")}
                </Button>
              </div>

              {failed ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-cf-sm border border-amber-500/40 bg-amber-500/5 p-3">
                    <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" aria-hidden />
                    <p className="type-body-small text-muted-foreground">
                      {timedOut
                        ? t("oauthLoginTimeout")
                        : (statusQuery.data?.error ?? t("oauthLoginError"))}
                    </p>
                  </div>
                  <div className="space-y-2 rounded-cf-sm border border-transparent p-3 bg-surface-400">
                    <div>
                      <p className="type-label-large text-foreground">{t("oauthManualCallback")}</p>
                      <p className="type-body-small text-muted-foreground">
                        {t("oauthManualCallbackDescription")}
                      </p>
                    </div>
                    <Input
                      value={callbackUrl}
                      onChange={(event) => setCallbackUrl(event.target.value)}
                      placeholder={t("oauthManualCallbackPlaceholder")}
                      aria-label={t("oauthManualCallback")}
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={callbackMutation.isPending}
                      onClick={handleSubmitCallback}
                    >
                      {callbackMutation.isPending
                        ? tCommon("loading")
                        : t("oauthManualCallbackSubmit")}
                    </Button>
                  </div>
                </div>
              ) : status === "ok" ? (
                <div className="flex items-center gap-2 text-status-success">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  <span className="type-body-small">{t("oauthLoginSuccess")}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  <span className="type-body-small">{t("oauthPolling")}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tCommon("close")}
          </Button>
          {!session ? (
            <Button type="button" onClick={handleStart} disabled={initiateMutation.isPending}>
              {initiateMutation.isPending ? t("oauthStarting") : t("oauthStartLogin")}
            </Button>
          ) : failed ? (
            <Button type="button" onClick={handleRetry}>
              {t("oauthRetry")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
