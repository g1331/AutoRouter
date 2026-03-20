"use client";

import { formatDistanceToNow } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { Trash2, Copy, Check, Key, Eye, EyeOff, Pencil, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import type { APIKey } from "@/types/api";
import { useRevealAPIKey } from "@/hooks/use-api-keys";
import { useToggleAPIKeyActive } from "@/hooks/use-api-keys";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";

interface KeysTableProps {
  keys: APIKey[];
  onRevoke: (key: APIKey) => void;
  onEdit: (key: APIKey) => void;
}

function formatAccessModeLabel(key: APIKey, t: ReturnType<typeof useTranslations>): string {
  if (key.access_mode === "unrestricted") {
    return t("unrestrictedAccess");
  }

  return t("restrictedAccessCount", { count: key.upstream_ids.length });
}

function formatQuotaPeriodLabel(
  rule: APIKey["spending_rule_statuses"][number],
  t: ReturnType<typeof useTranslations>
): string {
  if (rule.period_type === "rolling") {
    return t("quotaPeriodRollingWithHours", { hours: rule.period_hours ?? 24 });
  }

  return t(`quotaPeriodType_${rule.period_type}`);
}

export function KeysTable({ keys, onRevoke, onEdit }: KeysTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleKeyIds, setVisibleKeyIds] = useState<Set<string>>(new Set());
  const [revealedKeys, setRevealedKeys] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const { mutateAsync: revealKey, isPending: isRevealing } = useRevealAPIKey();
  const toggleActiveMutation = useToggleAPIKeyActive();
  const t = useTranslations("keys");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const currencyFormatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

  const filteredKeys = keys.filter((key) =>
    key.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const updateLayout = () => setIsMobileLayout(mediaQuery.matches);
    updateLayout();

    mediaQuery.addEventListener("change", updateLayout);
    return () => {
      mediaQuery.removeEventListener("change", updateLayout);
    };
  }, []);

  const toggleExpand = (keyId: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(keyId)) next.delete(keyId);
      else next.add(keyId);
      return next;
    });
  };

  const maskKey = (keyPrefix: string) => {
    if (keyPrefix.length < 12) return keyPrefix;
    const start = keyPrefix.slice(0, 8);
    const end = keyPrefix.slice(-4);
    return `${start}***${end}`;
  };

  const toggleKeyVisibility = async (keyId: string) => {
    if (visibleKeyIds.has(keyId)) {
      setVisibleKeyIds((prev) => {
        const next = new Set(prev);
        next.delete(keyId);
        return next;
      });

      setRevealedKeys((prev) => {
        const next = new Map(prev);
        next.delete(keyId);
        return next;
      });

      return;
    }

    if (!revealedKeys.has(keyId)) {
      try {
        const response = await revealKey(keyId);
        setRevealedKeys((prev) => new Map(prev).set(keyId, response.key_value));
      } catch {
        return;
      }
    }

    setVisibleKeyIds((prev) => new Set(prev).add(keyId));
  };

  const copyKey = async (keyId: string) => {
    try {
      let keyValue = revealedKeys.get(keyId);

      if (!keyValue) {
        try {
          const response = await revealKey(keyId);
          keyValue = response.key_value;
        } catch {
          return;
        }
      }

      await navigator.clipboard.writeText(keyValue);
      setCopiedId(keyId);
      toast.success(tCommon("copied"));
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error(tCommon("error"));
    }
  };

  const formatExpiry = (expiresAt: string | null) => {
    if (!expiresAt) {
      return (
        <Badge variant="success" className="whitespace-nowrap">
          {t("neverExpires")}
        </Badge>
      );
    }

    const expiryDate = new Date(expiresAt);
    const now = new Date();
    const isExpired = expiryDate < now;

    if (isExpired) {
      return (
        <Badge variant="error" className="whitespace-nowrap">
          {t("expired")}
        </Badge>
      );
    }

    return (
      <Badge variant="warning" className="whitespace-nowrap">
        {formatDistanceToNow(expiryDate, { addSuffix: true, locale: dateLocale })}
      </Badge>
    );
  };

  const handleToggleKeyActive = async (key: APIKey, nextActive: boolean) => {
    if (nextActive === key.is_active) {
      return;
    }

    try {
      await toggleActiveMutation.mutateAsync({
        id: key.id,
        nextActive,
      });
    } catch {
      // Error toast handled in hook
    }
  };

  const formatQuotaAmount = (value: number) => currencyFormatter.format(value);

  const renderQuotaRules = (key: APIKey) => {
    if (!key.spending_rules || key.spending_rules.length === 0) {
      return null;
    }

    if (key.spending_rule_statuses.length === 0) {
      return (
        <div className="rounded-cf-sm border border-divider/80 bg-surface-300/70 px-3 py-2">
          <p className="type-body-small text-muted-foreground">{t("quotaStatusPending")}</p>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "grid gap-3",
          key.spending_rule_statuses.length === 1
            ? "grid-cols-1"
            : key.spending_rule_statuses.length === 2
              ? "grid-cols-2"
              : "grid-cols-3"
        )}
      >
        {key.spending_rule_statuses.map((rule, index) => {
          const timeText =
            rule.period_type === "rolling"
              ? rule.estimated_recovery_at
                ? t("quotaRecoveryTime", {
                    time: formatDistanceToNow(new Date(rule.estimated_recovery_at), {
                      addSuffix: true,
                      locale: dateLocale,
                    }),
                  })
                : t("quotaRecoveryPending")
              : rule.resets_at
                ? t("quotaResetTime", {
                    time: formatDistanceToNow(new Date(rule.resets_at), {
                      addSuffix: true,
                      locale: dateLocale,
                    }),
                  })
                : null;

          return (
            <div
              key={`${key.id}-quota-${index}`}
              className={cn(
                "rounded-cf-sm border px-3 py-2",
                rule.is_exceeded
                  ? "border-status-error/40 bg-status-error-muted/60"
                  : "border-divider/80 bg-surface-300/70"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="type-body-small font-medium text-foreground">
                  {formatQuotaPeriodLabel(rule, t)}
                </span>
                <span
                  className={cn(
                    "type-caption tabular-nums",
                    rule.is_exceeded ? "text-status-error" : "text-muted-foreground"
                  )}
                >
                  {rule.percent_used.toFixed(1)}%
                </span>
              </div>

              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-400/70">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    rule.is_exceeded ? "bg-status-error" : "bg-primary"
                  )}
                  style={{ width: `${Math.min(rule.percent_used, 100)}%` }}
                />
              </div>

              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="type-caption tabular-nums text-muted-foreground">
                  {formatQuotaAmount(rule.current_spending)} /{" "}
                  {formatQuotaAmount(rule.spending_limit)}
                </span>
                {timeText ? (
                  <span className="type-caption truncate text-muted-foreground/70">{timeText}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (keys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-cf-md border border-divider bg-surface-300/80">
          <Key className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 className="type-title-medium mb-2 text-foreground">{t("noKeys")}</h3>
        <p className="type-body-medium text-muted-foreground">{t("noKeysDesc")}</p>
      </div>
    );
  }

  if (filteredKeys.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-cf-md border border-divider bg-surface-200/70 px-4 py-3">
          <Input
            type="text"
            placeholder={t("searchKeys")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
          <span className="type-caption text-muted-foreground">
            {filteredKeys.length} / {keys.length}
          </span>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-cf-md border border-divider bg-surface-300/80">
            <Key className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="type-title-medium mb-2 text-foreground">{t("noKeysFound")}</h3>
          <p className="type-body-medium text-muted-foreground">{t("noKeysFoundDesc")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-cf-md border border-divider bg-surface-200/70 px-4 py-3">
        <Input
          type="text"
          placeholder={t("searchKeys")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        <span className="type-caption text-muted-foreground">
          {filteredKeys.length} / {keys.length}
        </span>
      </div>
      {isMobileLayout ? (
        <div className="space-y-3">
          {filteredKeys.map((key) => (
            <div
              key={key.id}
              className="space-y-3 rounded-cf-md border border-divider bg-surface-200/70 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="type-title-medium truncate text-foreground">{key.name}</p>
                  <p className="type-body-small text-muted-foreground">{key.description || "-"}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={key.is_active ? "success" : "neutral"} className="shrink-0">
                    {key.is_active ? t("enabled") : t("disabled")}
                  </Badge>
                  {key.is_quota_exceeded ? (
                    <Badge variant="error" className="shrink-0">
                      {t("quotaExceeded")}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <code
                  className={cn(
                    "block min-w-0 flex-1 rounded-cf-sm border border-divider bg-surface-300 px-2 py-1 font-mono text-xs text-foreground",
                    visibleKeyIds.has(key.id)
                      ? "whitespace-normal break-all"
                      : "truncate whitespace-nowrap"
                  )}
                >
                  {visibleKeyIds.has(key.id)
                    ? revealedKeys.get(key.id) || key.key_prefix
                    : maskKey(key.key_prefix)}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => toggleKeyVisibility(key.id)}
                  disabled={isRevealing}
                  aria-label={`${visibleKeyIds.has(key.id) ? t("hideKey") : t("revealKey")} (mobile)`}
                >
                  {visibleKeyIds.has(key.id) ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => copyKey(key.id)}
                  aria-label={`${copiedId === key.id ? tCommon("copied") : tCommon("copy")} (mobile)`}
                >
                  {copiedId === key.id ? (
                    <Check className="h-3.5 w-3.5 text-status-success" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-divider pt-2">
                <div className="space-y-1">
                  <p className="type-caption text-muted-foreground">{t("tableUpstreams")}</p>
                  <Badge
                    variant={key.access_mode === "unrestricted" ? "success" : "info"}
                    className="shrink-0 whitespace-nowrap"
                  >
                    {formatAccessModeLabel(key, t)}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="type-caption text-muted-foreground">{t("tableExpires")}</p>
                  {formatExpiry(key.expires_at)}
                </div>
                <div className="col-span-2 space-y-1">
                  <p className="type-caption text-muted-foreground">{tCommon("createdAt")}</p>
                  <p className="type-body-small text-foreground">
                    {formatDistanceToNow(new Date(key.created_at), {
                      addSuffix: true,
                      locale: dateLocale,
                    })}
                  </p>
                </div>
              </div>

              {key.spending_rules && key.spending_rules.length > 0 ? (
                <div className="space-y-2 border-t border-divider pt-2">
                  <p className="type-caption text-muted-foreground">{t("spendingRules")}</p>
                  {renderQuotaRules(key)}
                </div>
              ) : null}

              <div className="flex items-center justify-between border-t border-divider pt-2">
                <div className="inline-flex items-center gap-2">
                  <Switch
                    checked={key.is_active}
                    onCheckedChange={async (nextActive) => {
                      await handleToggleKeyActive(key, nextActive);
                    }}
                    disabled={
                      toggleActiveMutation.isPending &&
                      toggleActiveMutation.variables?.id === key.id
                    }
                    className="h-5 w-10"
                    aria-label={`${key.is_active ? t("quickDisable") : t("quickEnable")}: ${key.name} (mobile)`}
                  />
                  <span
                    className={cn(
                      "type-caption whitespace-nowrap",
                      key.is_active ? "text-status-success" : "text-muted-foreground"
                    )}
                  >
                    {key.is_active ? t("enabled") : t("disabled")}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-8 w-8"
                    onClick={() => onEdit(key)}
                    aria-label={`${t("editKey")}: ${key.name} (mobile)`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-8 w-8 text-status-error hover:bg-status-error-muted"
                    onClick={() => onRevoke(key)}
                    aria-label={`${t("revokeKey")}: ${key.name} (mobile)`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-cf-md border border-divider bg-surface-200/70">
          <Table frame="none" containerClassName="rounded-none bg-transparent">
            <TableHeader>
              <TableRow>
                <TableHead>{tCommon("name")}</TableHead>
                <TableHead className="w-[22rem] max-w-[22rem] whitespace-nowrap">
                  {t("tableKeyPrefix")}
                </TableHead>
                <TableHead className="hidden xl:table-cell">{tCommon("description")}</TableHead>
                <TableHead>{t("tableUpstreams")}</TableHead>
                <TableHead className="whitespace-nowrap">{t("tableExpires")}</TableHead>
                <TableHead className="hidden whitespace-nowrap 2xl:table-cell">
                  {tCommon("createdAt")}
                </TableHead>
                <TableHead className="text-right">{tCommon("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredKeys.map((key) => {
                const hasQuota = !!(key.spending_rules && key.spending_rules.length > 0);
                const isExpanded = expandedKeys.has(key.id);
                return (
                  <Fragment key={key.id}>
                    <TableRow className={cn(hasQuota && isExpanded && "[&>td]:border-b-0")}>
                      <TableCell
                        className={cn("max-w-[200px] font-medium", hasQuota && "cursor-pointer")}
                        onClick={() => hasQuota && toggleExpand(key.id)}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {hasQuota ? (
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                                isExpanded && "rotate-90"
                              )}
                              aria-hidden="true"
                            />
                          ) : (
                            <span className="w-4 shrink-0" />
                          )}
                          <span className="truncate">{key.name}</span>
                          <span
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              key.is_active ? "bg-status-success" : "bg-muted-foreground/40"
                            )}
                            title={key.is_active ? t("enabled") : t("disabled")}
                          />
                          {key.is_quota_exceeded ? (
                            <Badge variant="error" className="shrink-0 whitespace-nowrap">
                              {t("quotaExceeded")}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="w-[22rem] max-w-[22rem]">
                        <div className="flex min-w-0 items-center gap-2">
                          <code
                            className={cn(
                              "block min-w-0 flex-1 rounded-cf-sm border border-divider bg-surface-300 px-2 py-1 align-middle font-mono text-[11px] text-foreground",
                              visibleKeyIds.has(key.id)
                                ? "overflow-x-auto overflow-y-hidden whitespace-nowrap"
                                : "truncate whitespace-nowrap"
                            )}
                          >
                            {visibleKeyIds.has(key.id)
                              ? revealedKeys.get(key.id) || key.key_prefix
                              : maskKey(key.key_prefix)}
                          </code>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => toggleKeyVisibility(key.id)}
                              disabled={isRevealing}
                              aria-label={visibleKeyIds.has(key.id) ? t("hideKey") : t("revealKey")}
                            >
                              {visibleKeyIds.has(key.id) ? (
                                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => copyKey(key.id)}
                              aria-label={copiedId === key.id ? tCommon("copied") : tCommon("copy")}
                            >
                              {copiedId === key.id ? (
                                <Check
                                  className="h-3.5 w-3.5 text-status-success"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-[180px] truncate xl:table-cell">
                        {key.description || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span
                          className={cn(
                            "type-body-small",
                            key.access_mode === "unrestricted"
                              ? "text-muted-foreground"
                              : "text-foreground"
                          )}
                        >
                          {formatAccessModeLabel(key, t)}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatExpiry(key.expires_at)}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap 2xl:table-cell">
                        {formatDistanceToNow(new Date(key.created_at), {
                          addSuffix: true,
                          locale: dateLocale,
                        })}
                      </TableCell>
                      <TableCell className="pl-2 pr-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="inline-flex items-center gap-2">
                            <Switch
                              checked={key.is_active}
                              onCheckedChange={async (nextActive) => {
                                await handleToggleKeyActive(key, nextActive);
                              }}
                              disabled={
                                toggleActiveMutation.isPending &&
                                toggleActiveMutation.variables?.id === key.id
                              }
                              className="h-5 w-10"
                              aria-label={`${key.is_active ? t("quickDisable") : t("quickEnable")}: ${key.name}`}
                            />
                            <span
                              className={cn(
                                "type-caption hidden whitespace-nowrap 2xl:inline",
                                key.is_active ? "text-status-success" : "text-muted-foreground"
                              )}
                            >
                              {key.is_active ? t("enabled") : t("disabled")}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            className="h-8 w-8"
                            onClick={() => onEdit(key)}
                            aria-label={`${t("editKey")}: ${key.name}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            className="h-8 w-8 text-status-error hover:bg-status-error-muted"
                            onClick={() => onRevoke(key)}
                            aria-label={`${t("revokeKey")}: ${key.name}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && hasQuota ? (
                      <TableRow className="animate-in fade-in-0 slide-in-from-top-1 duration-200 hover:bg-transparent">
                        <TableCell colSpan={7} className="border-t-0 bg-surface-300/30 px-4 py-2.5">
                          {renderQuotaRules(key)}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
