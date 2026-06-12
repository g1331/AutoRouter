"use client";

import { formatDistanceToNow } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { Key, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTogglePortalKeyActive } from "@/hooks/use-portal-keys";
import { getDateLocale } from "@/lib/date-locale";
import type { APIKey } from "@/types/api";

interface PortalKeysTableProps {
  keys: APIKey[];
  onEdit: (key: APIKey) => void;
  onRevoke: (key: APIKey) => void;
}

function maskKeyPrefix(keyPrefix: string): string {
  if (keyPrefix.length < 12) {
    return keyPrefix;
  }
  return `${keyPrefix.slice(0, 8)}***${keyPrefix.slice(-4)}`;
}

/**
 * Self-service key list: name, masked prefix, granted upstream count, quota
 * status, active toggle, and edit/delete actions. All mutations go through the
 * portal endpoints, so they are bounded to the caller's own keys server-side.
 */
export function PortalKeysTable({ keys, onEdit, onRevoke }: PortalKeysTableProps) {
  const t = useTranslations("keys");
  const tPortal = useTranslations("portal");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const toggleActiveMutation = useTogglePortalKeyActive();

  if (keys.length === 0) {
    return (
      <Card
        variant="outlined"
        className="flex flex-col items-center gap-2 border-divider bg-surface-200/70 px-6 py-10 text-center"
      >
        <Key className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="type-body-medium text-foreground">{t("noKeys")}</p>
        <p className="max-w-md type-body-small text-muted-foreground">
          {tPortal("keys.noKeysDesc")}
        </p>
      </Card>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{tCommon("name")}</TableHead>
          <TableHead className="hidden md:table-cell">{t("tableKeyPrefix")}</TableHead>
          <TableHead className="hidden lg:table-cell">{t("tableUpstreams")}</TableHead>
          <TableHead>{t("spendingRules")}</TableHead>
          <TableHead>{tCommon("status")}</TableHead>
          <TableHead className="hidden md:table-cell">{tCommon("createdAt")}</TableHead>
          <TableHead className="text-right">{tCommon("actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => (
          <TableRow key={key.id}>
            <TableCell>
              <div className="min-w-0">
                <p className="truncate type-body-medium text-foreground">{key.name}</p>
                {key.description && (
                  <p className="truncate type-body-small text-muted-foreground">
                    {key.description}
                  </p>
                )}
              </div>
            </TableCell>
            <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
              {maskKeyPrefix(key.key_prefix)}
            </TableCell>
            <TableCell className="hidden lg:table-cell">
              <Badge variant="info">
                {t("restrictedAccessCount", { count: key.upstream_ids.length })}
              </Badge>
            </TableCell>
            <TableCell>
              {key.spending_rule_statuses.length === 0 ? (
                <span className="type-body-small text-muted-foreground">
                  {tPortal("keys.quotaUnlimited")}
                </span>
              ) : key.is_quota_exceeded ? (
                <Badge variant="destructive">{t("quotaExceeded")}</Badge>
              ) : (
                <Badge variant="neutral">
                  {tPortal("keys.quotaRuleCount", {
                    count: key.spending_rule_statuses.length,
                  })}
                </Badge>
              )}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Switch
                  checked={key.is_active}
                  disabled={toggleActiveMutation.isPending}
                  onCheckedChange={(checked) =>
                    toggleActiveMutation.mutate({ id: key.id, nextActive: checked })
                  }
                  aria-label={key.is_active ? t("quickDisable") : t("quickEnable")}
                />
                <span className="hidden type-body-small text-muted-foreground sm:inline">
                  {key.is_active ? t("enabled") : t("disabled")}
                </span>
              </div>
            </TableCell>
            <TableCell className="hidden type-body-small text-muted-foreground md:table-cell">
              {formatDistanceToNow(new Date(key.created_at), {
                addSuffix: true,
                locale: dateLocale,
              })}
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(key)}
                  aria-label={t("editKey")}
                  title={t("editKey")}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onRevoke(key)}
                  aria-label={t("revokeKey")}
                  title={t("revokeKey")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
