"use client";

import { useRef } from "react";
import {
  Boxes,
  Download,
  Info,
  ListTree,
  MoreHorizontal,
  Pencil,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CliproxyAccountUsage, CliproxyAuthAccount } from "@/types/cliproxy";

interface CliproxyAccountsTableProps {
  accounts: CliproxyAuthAccount[];
  usageByName?: Map<string, CliproxyAccountUsage>;
  usageState?: "loading" | "error" | "stale" | "ready";
  onToggleStatus: (account: CliproxyAuthAccount) => void;
  onEditFields: (account: CliproxyAuthAccount, source: HTMLElement | null) => void;
  onMapUpstream: (account: CliproxyAuthAccount) => void;
  onViewDetail: (account: CliproxyAuthAccount, source: HTMLElement | null) => void;
  onViewModels: (account: CliproxyAuthAccount) => void;
  onDownload: (account: CliproxyAuthAccount) => void;
  onDelete: (account: CliproxyAuthAccount, source: HTMLElement | null) => void;
}

function RequestCounts({
  usage,
  state,
}: {
  usage: CliproxyAccountUsage | undefined;
  state: "loading" | "error" | "stale" | "ready";
}) {
  const t = useTranslations("cliproxy");
  if (state === "loading")
    return <span className="text-muted-foreground">{t("usageLoading")}</span>;
  if (state === "error")
    return <span className="text-muted-foreground">{t("usageUnavailable")}</span>;
  if (!usage || (usage.success === null && usage.failed === null)) {
    return <span className="text-muted-foreground">{t("usageUnknown")}</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 tabular-nums type-body-small">
      <span>
        <span className="text-muted-foreground">{t("usageSuccess")}</span> {usage.success ?? "—"}
      </span>
      <span>
        <span className="text-muted-foreground">{t("usageFailed")}</span> {usage.failed ?? "—"}
      </span>
    </div>
  );
}

/** 账号目录与独立的运行时用量快照并列展示，窄屏优先保留账号、状态和请求数。 */
export function CliproxyAccountsTable({
  accounts,
  usageByName,
  usageState = "ready",
  onToggleStatus,
  onEditFields,
  onMapUpstream,
  onViewDetail,
  onViewModels,
  onDownload,
  onDelete,
}: CliproxyAccountsTableProps) {
  const t = useTranslations("cliproxy");
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const rowSource = (id: string) => rowRefs.current.get(id) ?? null;

  return (
    <Table frame="subtle" className="table-fixed" containerClassName="rounded-cf-sm">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[54%] px-2 sm:w-auto sm:px-4">{t("columnAccountFile")}</TableHead>
          <TableHead className="w-[31%] px-2 sm:w-36 sm:px-4">{t("columnRequests")}</TableHead>
          <TableHead className="hidden w-32 lg:table-cell">{t("columnQuotaObservation")}</TableHead>
          <TableHead className="w-[15%] px-1 text-right sm:w-16 sm:px-4">
            {t("columnActions")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => {
          const usage = usageByName?.get(account.auth_file_name);
          const hasQuota = Boolean(
            (usage?.quota && Object.keys(usage.quota.signals).length > 0) ||
            (usage?.model_quotas &&
              Object.values(usage.model_quotas).some(
                (quota) => Object.keys(quota.signals).length > 0
              ))
          );
          return (
            <TableRow
              key={account.id}
              data-morph-source
              ref={(el) => {
                if (el) rowRefs.current.set(account.id, el);
                else rowRefs.current.delete(account.id);
              }}
            >
              <TableCell className="min-w-0 px-2 py-3 align-top sm:px-4">
                <div className="min-w-0 space-y-1.5">
                  <p className="break-all font-medium leading-snug">{account.auth_file_name}</p>
                  <p className="break-all type-body-small text-muted-foreground">
                    {account.email ?? "—"}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="info">{account.provider}</Badge>
                    <Badge variant={account.disabled ? "secondary" : "success"}>
                      {account.disabled ? t("accountStatusDisabled") : t("accountStatusEnabled")}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-body-small text-muted-foreground">
                    {account.prefix ? (
                      <code className="break-all font-mono">{account.prefix}</code>
                    ) : (
                      <span>{t("prefixUnset")}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => onViewModels(account)}
                      className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                    >
                      <ListTree className="h-3.5 w-3.5" aria-hidden />
                      {account.model_count}
                    </button>
                  </div>
                </div>
              </TableCell>
              <TableCell className="px-2 py-3 align-top sm:px-4">
                <RequestCounts usage={usage} state={usageState} />
                {(usageState === "ready" || usageState === "stale") && hasQuota ? (
                  <span className="mt-1 block type-body-small text-muted-foreground lg:hidden">
                    {t("quotaObserved")}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="hidden py-3 align-top lg:table-cell">
                {(usageState === "ready" || usageState === "stale") && hasQuota ? (
                  <button
                    type="button"
                    onClick={() => onViewDetail(account, rowSource(account.id))}
                    className="type-body-small text-primary underline-offset-2 hover:underline"
                  >
                    {t("quotaObserved")}
                  </button>
                ) : (
                  <span className="type-body-small text-muted-foreground">
                    {t("quotaNotObserved")}
                  </span>
                )}
              </TableCell>
              <TableCell className="px-1 py-2 text-right align-top sm:px-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={t("columnActions")}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onViewDetail(account, rowSource(account.id))}>
                      <Info className="mr-2 h-4 w-4" />
                      {t("actionViewDetail")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onViewModels(account)}>
                      <ListTree className="mr-2 h-4 w-4" />
                      {t("actionViewModels")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggleStatus(account)}>
                      {account.disabled ? (
                        <Power className="mr-2 h-4 w-4" />
                      ) : (
                        <PowerOff className="mr-2 h-4 w-4" />
                      )}
                      {account.disabled ? t("actionEnable") : t("actionDisable")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEditFields(account, rowSource(account.id))}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {t("actionEditFields")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onMapUpstream(account)}>
                      <Boxes className="mr-2 h-4 w-4" />
                      {t("actionMapUpstream")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDownload(account)}>
                      <Download className="mr-2 h-4 w-4" />
                      {t("actionDownload")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(account, rowSource(account.id))}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("actionDelete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
