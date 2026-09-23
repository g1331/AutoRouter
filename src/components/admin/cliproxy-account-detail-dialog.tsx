"use client";

import { useRef } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCliproxyProviderQuota } from "@/hooks/use-cliproxy";
import type {
  CliproxyAccountUsage,
  CliproxyAuthAccount,
  CliproxyQuotaObservation,
} from "@/types/cliproxy";

interface CliproxyAccountDetailDialogProps {
  instanceId: string;
  account: CliproxyAuthAccount;
  usage?: CliproxyAccountUsage | null;
  usageState?: "loading" | "error" | "stale" | "ready";
  open: boolean;
  onClose: () => void;
  /** 启用容器变形动画时，由调用方传入与源元素一致的 view-transition-name。 */
  morph?: boolean;
  morphName?: string;
}

/** 将可空字符串渲染为占位符。 */
function renderText(value: string | null | undefined, placeholder: string): React.ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{placeholder}</span>;
  }
  return value;
}

/** 将 ISO 时间戳渲染为本地格式。 */
function renderTimestamp(value: string | null, placeholder: string): React.ReactNode {
  if (!value) {
    return <span className="text-muted-foreground">{placeholder}</span>;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * 展示 OAuth 账号的完整元数据：邮箱、上游状态、前缀、备注、模型数、原始快照、时间戳等。
 */
export function CliproxyAccountDetailDialog({
  instanceId,
  account,
  usage,
  usageState = "ready",
  open,
  onClose,
  morph,
  morphName = "morph-cliproxy-account",
}: CliproxyAccountDetailDialogProps) {
  const t = useTranslations("cliproxy");
  const tCommon = useTranslations("common");
  const placeholder = t("accountDetailEmpty");
  const status = account.status;
  const statusMessage =
    account.raw_metadata && typeof account.raw_metadata.status_message === "string"
      ? (account.raw_metadata.status_message as string)
      : null;
  const modelQuotas = Object.entries(usage?.model_quotas ?? {});
  const hasQuotaSignals = Boolean(
    (usage?.quota && Object.keys(usage.quota.signals).length > 0) ||
    modelQuotas.some(([, quota]) => Object.keys(quota.signals).length > 0)
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const supportedProvider = /^(codex|openai|claude|anthropic)$/i.test(account.provider);
  const {
    data: providerQuota,
    isPending: providerQuotaPending,
    isError: providerQuotaError,
    isFetching: providerQuotaFetching,
    refetch: refetchProviderQuota,
  } = useCliproxyProviderQuota(
    instanceId,
    supportedProvider && !account.disabled ? account.auth_file_name : null
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-w-2xl"
        morph={morph}
        morphName={morphName}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1} className="focus-visible:shadow-none">
            {t("accountDetailDialogTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("accountFileLabel")}: {account.auth_file_name}
          </DialogDescription>
        </DialogHeader>

        <div
          tabIndex={0}
          className="max-h-[min(58dvh,34rem)] space-y-3 overflow-y-auto py-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <section
            className="space-y-3 border-b border-divider pb-4"
            aria-label={t("providerQuotaTitle")}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="type-title-small text-foreground">{t("providerQuotaTitle")}</h3>
                <p className="type-body-small text-muted-foreground">
                  {t("providerQuotaExplanation")}
                </p>
              </div>
              {supportedProvider && !account.disabled ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={providerQuotaFetching}
                  onClick={() => void refetchProviderQuota()}
                >
                  <RefreshCw
                    className={
                      providerQuotaFetching
                        ? "mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                        : "mr-2 h-4 w-4"
                    }
                  />
                  {t("providerQuotaRefresh")}
                </Button>
              ) : null}
            </div>
            {!supportedProvider ? (
              <p className="type-body-small text-muted-foreground">
                {t("providerQuotaUnsupported")}
              </p>
            ) : account.disabled ? (
              <p className="type-body-small text-muted-foreground">{t("providerQuotaDisabled")}</p>
            ) : providerQuotaPending ? (
              <p className="type-body-small text-muted-foreground">{t("providerQuotaLoading")}</p>
            ) : providerQuotaError ? (
              <p role="alert" className="type-body-small text-destructive">
                {t("providerQuotaFailed")}
              </p>
            ) : providerQuota?.status === "unavailable" ? (
              <p className="type-body-small text-muted-foreground">
                {providerQuota.reason === "missing_auth_index"
                  ? t("providerQuotaMissingAuthIndex")
                  : providerQuota.reason === "upstream_unavailable"
                    ? t("providerQuotaUpstreamUnavailable")
                    : t("providerQuotaDisabled")}
              </p>
            ) : providerQuota?.status === "unsupported" ? (
              <p className="type-body-small text-muted-foreground">
                {t("providerQuotaUnsupported")}
              </p>
            ) : providerQuota?.windows.length ? (
              <>
                <div className="divide-y divide-divider">
                  {providerQuota.windows.map((window) => (
                    <div key={window.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-4">
                        <h4 className="type-label-large text-foreground">
                          {t(`providerQuotaWindow.${window.id}`)}
                        </h4>
                        <p className="flex shrink-0 items-baseline gap-1 tabular-nums text-foreground">
                          <span className="text-xl font-semibold tracking-tight">
                            {window.remaining_percent === null
                              ? t("providerQuotaUnknown")
                              : `${window.remaining_percent}%`}
                          </span>
                          <span className="type-body-small text-muted-foreground">
                            {t("providerQuotaRemaining")}
                          </span>
                        </p>
                      </div>
                      {window.remaining_percent !== null ? (
                        <div
                          role="progressbar"
                          aria-label={t(`providerQuotaWindow.${window.id}`)}
                          aria-valuenow={window.remaining_percent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuetext={`${window.remaining_percent}% ${t("providerQuotaRemaining")}`}
                          className="h-2 overflow-hidden rounded-full bg-surface-400"
                        >
                          <div
                            className="h-full rounded-full bg-primary transition-[width] duration-cf-normal ease-cf-standard motion-reduce:transition-none"
                            style={{ width: `${window.remaining_percent}%` }}
                          />
                        </div>
                      ) : null}
                      <p className="type-body-small text-muted-foreground">
                        {window.resets_at
                          ? `${t("providerQuotaResetsAt")}: ${renderTimestamp(window.resets_at, "—")}`
                          : t("providerQuotaResetUnknown")}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="type-body-small text-muted-foreground">
                  {t("providerQuotaFetchedAt")}: {renderTimestamp(providerQuota.fetched_at, "—")}
                </p>
              </>
            ) : (
              <p className="type-body-small text-muted-foreground">{t("providerQuotaNoWindows")}</p>
            )}
          </section>
          <div className="space-y-2 border-b border-divider pb-3">
            <h3 className="type-title-small text-foreground">{t("usageDetailTitle")}</h3>
            {usageState === "loading" || usageState === "error" ? (
              <p className="type-body-small text-muted-foreground">
                {usageState === "loading" ? t("usageLoading") : t("usageLoadFailed")}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="type-body-small text-muted-foreground">{t("usageSuccess")}</p>
                  <p className="text-lg font-semibold tabular-nums">{usage?.success ?? "—"}</p>
                </div>
                <div>
                  <p className="type-body-small text-muted-foreground">{t("usageFailed")}</p>
                  <p className="text-lg font-semibold tabular-nums">{usage?.failed ?? "—"}</p>
                </div>
                <div>
                  <p className="type-body-small text-muted-foreground">
                    {t("columnQuotaObservation")}
                  </p>
                  <p className="type-body-small font-medium">
                    {hasQuotaSignals ? t("quotaObserved") : t("quotaNotObserved")}
                  </p>
                </div>
              </div>
            )}
            {usageState === "stale" ? (
              <p className="type-body-small text-status-warning">{t("usageRefreshFailedStale")}</p>
            ) : null}
          </div>
          <DetailRow label={t("columnProvider")}>
            <Badge variant="info">{account.provider}</Badge>
          </DetailRow>
          <DetailRow label={t("accountDetailLabelEmail")}>
            {renderText(account.email, placeholder)}
          </DetailRow>
          <DetailRow label={t("accountDetailLabelStatus")}>
            {status ? <Badge variant="secondary">{status}</Badge> : renderText(null, placeholder)}
          </DetailRow>
          <DetailRow label={t("accountDetailLabelStatusMessage")}>
            {renderText(statusMessage, placeholder)}
          </DetailRow>
          <DetailRow label={t("columnStatus")}>
            <Badge variant={account.disabled ? "secondary" : "success"}>
              {account.disabled ? t("accountStatusDisabled") : t("accountStatusEnabled")}
            </Badge>
          </DetailRow>
          <DetailRow label={t("accountDetailLabelPrefix")}>
            {account.prefix ? (
              <code className="type-body-small font-mono">{account.prefix}</code>
            ) : (
              renderText(null, placeholder)
            )}
          </DetailRow>
          <DetailRow label={t("accountDetailLabelPriority")}>
            {account.priority === null || account.priority === undefined
              ? renderText(null, placeholder)
              : String(account.priority)}
          </DetailRow>
          <DetailRow label={t("accountDetailLabelNote")}>
            {renderText(account.note, placeholder)}
          </DetailRow>
          <DetailRow label={t("accountDetailLabelModelCount")}>{account.model_count}</DetailRow>
          <div className="space-y-3 border-t border-divider pt-4">
            <div>
              <h3 className="type-title-small text-foreground">{t("usageDetailTitle")}</h3>
              <p className="type-body-small text-muted-foreground">{t("usageExplanation")}</p>
            </div>
            {usageState === "loading" ? (
              <p className="type-body-small text-muted-foreground">{t("usageLoading")}</p>
            ) : usageState === "error" ? (
              <p className="type-body-small text-destructive">{t("usageLoadFailed")}</p>
            ) : (
              <>
                {usageState === "stale" ? (
                  <p className="type-body-small text-status-warning">
                    {t("usageRefreshFailedStale")}
                  </p>
                ) : null}
                <DetailRow label={t("usageSuccess")}>
                  {usage?.success ?? t("usageUnknown")}
                </DetailRow>
                <DetailRow label={t("usageFailed")}>{usage?.failed ?? t("usageUnknown")}</DetailRow>
                <div className="space-y-2 rounded-cf-sm bg-surface-400 p-3">
                  <h4 className="type-label-large text-foreground">{t("usageRecentTitle")}</h4>
                  {usage?.recent_requests === null || !usage ? (
                    <p className="type-body-small text-muted-foreground">{t("usageUnknown")}</p>
                  ) : usage.recent_requests.length === 0 ? (
                    <p className="type-body-small text-muted-foreground">{t("usageRecentEmpty")}</p>
                  ) : (
                    <ul className="max-h-40 space-y-1 overflow-y-auto type-body-small tabular-nums">
                      {usage.recent_requests.map((bucket, index) => (
                        <li
                          key={`${index}-${bucket.time}`}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="text-muted-foreground">{bucket.time}</span>
                          <span>
                            {t("usageSuccess")} {bucket.success} · {t("usageFailed")}{" "}
                            {bucket.failed}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="space-y-2 rounded-cf-sm bg-surface-400 p-3">
                  <h4 className="type-label-large text-foreground">{t("usageQuotaTitle")}</h4>
                  <p className="type-body-small text-muted-foreground">{t("usageQuotaCaveat")}</p>
                  <QuotaSignals observation={usage?.quota ?? null} empty={t("quotaNotObserved")} />
                  {modelQuotas.length > 0 ? (
                    <details className="space-y-2">
                      <summary className="cursor-pointer type-body-small text-primary">
                        {t("usageModelQuotas", { count: modelQuotas.length })}
                      </summary>
                      <div className="space-y-3 pt-2">
                        {modelQuotas.map(([model, observation]) => (
                          <div key={model} className="space-y-1 border-t border-divider pt-2">
                            <p className="break-all font-mono type-body-small">{model}</p>
                            <QuotaSignals observation={observation} empty={t("quotaNotObserved")} />
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              </>
            )}
          </div>
          <DetailRow label={t("accountDetailLabelLastSyncedAt")}>
            {renderTimestamp(account.last_synced_at, placeholder)}
          </DetailRow>
          <DetailRow label={t("accountDetailLabelCreatedAt")}>
            {renderTimestamp(account.created_at, placeholder)}
          </DetailRow>
          <DetailRow label={t("accountDetailLabelUpdatedAt")}>
            {renderTimestamp(account.updated_at, placeholder)}
          </DetailRow>

          {account.raw_metadata ? (
            <div className="space-y-1 pt-2">
              <span className="type-label-large text-muted-foreground">
                {t("accountDetailLabelRawMetadata")}
              </span>
              <pre className="overflow-x-auto rounded-cf-sm border border-transparent bg-surface-400 p-3 type-body-small font-mono">
                {JSON.stringify(account.raw_metadata, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>{tCommon("close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuotaSignals({
  observation,
  empty,
}: {
  observation: CliproxyQuotaObservation | null;
  empty: string;
}) {
  const t = useTranslations("cliproxy");
  const signals = Object.entries(observation?.signals ?? {});
  return (
    <div className="space-y-1">
      {observation?.observed_at ? (
        <p className="type-body-small text-muted-foreground">
          {t("usageObservedAt")}: {renderTimestamp(observation.observed_at, empty)}
        </p>
      ) : null}
      {signals.length === 0 ? (
        <p className="type-body-small text-muted-foreground">{empty}</p>
      ) : (
        <dl className="space-y-1">
          {signals.map(([name, value]) => (
            <div key={name} className="flex flex-wrap justify-between gap-x-3 type-body-small">
              <dt className="break-all text-muted-foreground">{name}</dt>
              <dd className="font-mono tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

interface DetailRowProps {
  label: string;
  children: React.ReactNode;
}

function DetailRow({ label, children }: DetailRowProps) {
  return (
    <div className="grid grid-cols-3 items-center gap-3 rounded-cf-sm border border-transparent p-2 bg-surface-400">
      <span className="type-label-large text-muted-foreground">{label}</span>
      <div className="col-span-2 type-body-medium">{children}</div>
    </div>
  );
}
