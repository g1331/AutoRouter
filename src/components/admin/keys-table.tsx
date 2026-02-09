"use client";

import { formatDistanceToNow } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { Trash2, Copy, Check, Key, Eye, EyeOff, Pencil, Power, PowerOff } from "lucide-react";
import { useState } from "react";
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
import { toast } from "sonner";
import { getDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";

interface KeysTableProps {
  keys: APIKey[];
  onRevoke: (key: APIKey) => void;
  onEdit: (key: APIKey) => void;
}

/**
 * Cassette Futurism API Keys Data Table
 *
 * Terminal-style data display with:
 * - Mono font for key data
 * - Amber accents and glow effects
 * - Status badges for expiry
 */
export function KeysTable({ keys, onRevoke, onEdit }: KeysTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleKeyIds, setVisibleKeyIds] = useState<Set<string>>(new Set());
  const [revealedKeys, setRevealedKeys] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const { mutateAsync: revealKey, isPending: isRevealing } = useRevealAPIKey();
  const toggleActiveMutation = useToggleAPIKeyActive();
  const t = useTranslations("keys");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const filteredKeys = keys.filter((key) =>
    key.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
      return <Badge variant="success">{t("neverExpires")}</Badge>;
    }

    const expiryDate = new Date(expiresAt);
    const now = new Date();
    const isExpired = expiryDate < now;

    if (isExpired) {
      return <Badge variant="error">{t("expired")}</Badge>;
    }

    return (
      <Badge variant="warning">
        {formatDistanceToNow(expiryDate, { addSuffix: true, locale: dateLocale })}
      </Badge>
    );
  };

  if (keys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-cf-sm bg-surface-300 border border-divider flex items-center justify-center mb-4">
          <Key className="w-8 h-8 text-amber-700" aria-hidden="true" />
        </div>
        <h3 className="font-mono text-lg text-amber-500 mb-2">{t("noKeys")}</h3>
        <p className="font-sans text-sm text-amber-700">{t("noKeysDesc")}</p>
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
          <div className="w-16 h-16 rounded-cf-sm bg-surface-300 border border-divider flex items-center justify-center mb-4">
            <Key className="w-8 h-8 text-amber-700" aria-hidden="true" />
          </div>
          <h3 className="font-mono text-lg text-amber-500 mb-2">{t("noKeysFound")}</h3>
          <p className="font-sans text-sm text-amber-700">{t("noKeysFoundDesc")}</p>
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
      <div className="rounded-cf-sm border border-divider overflow-hidden bg-surface-200">
        <Table frame="none" containerClassName="rounded-none">
          <TableHeader>
            <TableRow>
              <TableHead>{tCommon("name")}</TableHead>
              <TableHead>{t("tableKeyPrefix")}</TableHead>
              <TableHead>{tCommon("description")}</TableHead>
              <TableHead>{t("tableUpstreams")}</TableHead>
              <TableHead>{t("tableExpires")}</TableHead>
              <TableHead>{tCommon("createdAt")}</TableHead>
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
                <TableCell>
                  <div className="flex items-center gap-2">
                    <code className="px-2 py-1 bg-surface-300 text-amber-500 rounded-cf-sm font-mono text-xs border border-divider">
                      {visibleKeyIds.has(key.id)
                        ? revealedKeys.get(key.id) || key.key_prefix
                        : maskKey(key.key_prefix)}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
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
                      className="h-7 w-7"
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
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {key.description || <span className="text-amber-700">-</span>}
                </TableCell>
                <TableCell>
                  <Badge variant="info">{key.upstream_ids.length}</Badge>
                </TableCell>
                <TableCell>{formatExpiry(key.expires_at)}</TableCell>
                <TableCell>
                  {formatDistanceToNow(new Date(key.created_at), {
                    addSuffix: true,
                    locale: dateLocale,
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      data-state={key.is_active ? "on" : "off"}
                      className="group relative h-8 px-2 overflow-hidden border-2 border-amber-500/40 bg-black-900/60 text-amber-400 hover:bg-black-900/70 cf-scanlines cf-data-scan shadow-[inset_0_0_0_1px_rgba(255,191,0,0.10)] hover:shadow-cf-glow-subtle active:translate-y-[1px]"
                      onClick={async () => {
                        try {
                          await toggleActiveMutation.mutateAsync({
                            id: key.id,
                            nextActive: !key.is_active,
                          });
                        } catch {
                          // Error toast handled in hook
                        }
                      }}
                      disabled={
                        toggleActiveMutation.isPending &&
                        toggleActiveMutation.variables?.id === key.id
                      }
                      aria-label={`${key.is_active ? t("quickDisable") : t("quickEnable")}: ${key.name}`}
                    >
                      <span className="relative z-20 flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center",
                            "text-[12px] leading-none",
                            key.is_active ? "text-status-success" : "text-amber-500"
                          )}
                          aria-hidden="true"
                        >
                          {key.is_active ? "◉" : "◎"}
                        </span>
                        {key.is_active ? (
                          <PowerOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Power className="h-4 w-4" aria-hidden="true" />
                        )}
                        <span className="text-[11px] font-mono uppercase tracking-widest">
                          {key.is_active ? t("quickDisable") : t("quickEnable")}
                        </span>
                        <span className="ml-1 flex items-center gap-1" aria-hidden="true">
                          <span className="relative h-[14px] w-[34px] rounded-cf-sm border border-amber-500/40 bg-black-900/70 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35)]">
                            <span
                              className={cn(
                                "absolute top-[1px] left-[1px] h-[10px] w-[14px] rounded-[2px]",
                                "transition-transform duration-200 ease-out",
                                "shadow-[0_0_10px_rgba(255,191,0,0.25)]",
                                key.is_active
                                  ? "translate-x-0 bg-status-success"
                                  : "translate-x-[16px] bg-surface-400"
                              )}
                            />
                          </span>
                        </span>
                      </span>
                    </Button>
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
    </div>
  );
}
