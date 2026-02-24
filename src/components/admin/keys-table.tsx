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
      <div className="overflow-hidden rounded-cf-md border border-divider bg-surface-200/70">
        <Table frame="none" containerClassName="rounded-none bg-transparent">
          <TableHeader>
            <TableRow>
              <TableHead>{tCommon("name")}</TableHead>
              <TableHead>{t("tableKeyPrefix")}</TableHead>
              <TableHead className="hidden lg:table-cell">{tCommon("description")}</TableHead>
              <TableHead>{t("tableUpstreams")}</TableHead>
              <TableHead>{t("tableExpires")}</TableHead>
              <TableHead className="hidden md:table-cell">{tCommon("createdAt")}</TableHead>
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
                    <code className="rounded-cf-sm border border-divider bg-surface-300 px-2 py-1 font-mono text-xs text-foreground">
                      {visibleKeyIds.has(key.id)
                        ? revealedKeys.get(key.id) || key.key_prefix
                        : maskKey(key.key_prefix)}
                    </code>
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
                </TableCell>
                <TableCell className="hidden max-w-xs truncate lg:table-cell">
                  {key.description || <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell>
                  <Badge variant="info">{key.upstream_ids.length}</Badge>
                </TableCell>
                <TableCell>{formatExpiry(key.expires_at)}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {formatDistanceToNow(new Date(key.created_at), {
                    addSuffix: true,
                    locale: dateLocale,
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      className="h-8 gap-1.5 px-2.5"
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
                      <span
                        className={
                          key.is_active
                            ? "h-2 w-2 rounded-full bg-status-success"
                            : "h-2 w-2 rounded-full bg-muted-foreground"
                        }
                        aria-hidden="true"
                      />
                      <span className="text-xs text-foreground">
                        <span className="mr-1 inline-flex" aria-hidden="true">
                          {key.is_active ? (
                            <PowerOff className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <Power className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </span>
                        <span className="type-caption">
                          {key.is_active ? t("quickDisable") : t("quickEnable")}
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
