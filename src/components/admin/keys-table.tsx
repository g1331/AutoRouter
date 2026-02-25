"use client";

import { formatDistanceToNow } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { Trash2, Copy, Check, Key, Eye, EyeOff, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
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

export function KeysTable({ keys, onRevoke, onEdit }: KeysTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleKeyIds, setVisibleKeyIds] = useState<Set<string>>(new Set());
  const [revealedKeys, setRevealedKeys] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const { mutateAsync: revealKey, isPending: isRevealing } = useRevealAPIKey();
  const toggleActiveMutation = useToggleAPIKeyActive();
  const t = useTranslations("keys");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

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
        <Input
          type="text"
          placeholder={t("searchKeys")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
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
      <Input
        type="text"
        placeholder={t("searchKeys")}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-md"
      />
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
                <Badge variant={key.is_active ? "success" : "neutral"} className="shrink-0">
                  {key.is_active ? t("enabled") : t("disabled")}
                </Badge>
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
                  <Badge variant="info">{key.upstream_ids.length}</Badge>
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
                <TableHead className="w-[30rem] min-w-[30rem] whitespace-nowrap">
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
              {filteredKeys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{key.name}</span>
                      <Badge variant={key.is_active ? "success" : "neutral"}>
                        {key.is_active ? t("enabled") : t("disabled")}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="w-[30rem] min-w-[30rem]">
                    <div className="flex min-w-0 items-start gap-2">
                      <code
                        className={cn(
                          "block min-w-0 flex-1 rounded-cf-sm border border-divider bg-surface-300 px-2 py-1 align-middle font-mono text-xs text-foreground",
                          visibleKeyIds.has(key.id)
                            ? "whitespace-normal break-all"
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
                            <Check className="h-3.5 w-3.5 text-status-success" aria-hidden="true" />
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
                  <TableCell>
                    <Badge variant="info">{key.upstream_ids.length}</Badge>
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
