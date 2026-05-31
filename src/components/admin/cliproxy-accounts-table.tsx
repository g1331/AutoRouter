"use client";

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
import { cn } from "@/lib/utils";
import type { CliproxyAuthAccount } from "@/types/cliproxy";

interface CliproxyAccountsTableProps {
  accounts: CliproxyAuthAccount[];
  onToggleStatus: (account: CliproxyAuthAccount) => void;
  onEditFields: (account: CliproxyAuthAccount) => void;
  onMapUpstream: (account: CliproxyAuthAccount) => void;
  onViewDetail: (account: CliproxyAuthAccount) => void;
  onViewModels: (account: CliproxyAuthAccount) => void;
  onDownload: (account: CliproxyAuthAccount) => void;
  onDelete: (account: CliproxyAuthAccount) => void;
}

/**
 * CLIProxyAPI OAuth 账号列表表格。
 *
 * 每行展示账号文件名、服务商、邮箱、状态、模型数、前缀，并提供启停、字段编辑、
 * 映射上游、详情、模型列表、下载、删除等操作。模型数量可点击直接查看模型列表。
 */
export function CliproxyAccountsTable({
  accounts,
  onToggleStatus,
  onEditFields,
  onMapUpstream,
  onViewDetail,
  onViewModels,
  onDownload,
  onDelete,
}: CliproxyAccountsTableProps) {
  const t = useTranslations("cliproxy");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columnAccountFile")}</TableHead>
          <TableHead>{t("columnProvider")}</TableHead>
          <TableHead>{t("columnEmail")}</TableHead>
          <TableHead>{t("columnStatus")}</TableHead>
          <TableHead>{t("columnModelCount")}</TableHead>
          <TableHead>{t("columnPrefix")}</TableHead>
          <TableHead className="w-16 text-right">{t("columnActions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => (
          <TableRow key={account.id}>
            <TableCell className="font-medium">{account.auth_file_name}</TableCell>
            <TableCell>
              <Badge variant="info">{account.provider}</Badge>
            </TableCell>
            <TableCell>
              {account.email ? (
                <span className="type-body-small">{account.email}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={account.disabled ? "secondary" : "success"}>
                {account.disabled ? t("accountStatusDisabled") : t("accountStatusEnabled")}
              </Badge>
            </TableCell>
            <TableCell>
              <button
                type="button"
                onClick={() => onViewModels(account)}
                className="inline-flex items-center gap-1 type-body-small text-primary underline-offset-2 hover:underline"
              >
                <ListTree className="h-3.5 w-3.5" aria-hidden />
                {account.model_count}
              </button>
            </TableCell>
            <TableCell>
              {account.prefix ? (
                <code className="type-body-small font-mono">{account.prefix}</code>
              ) : (
                <span className="text-muted-foreground">{t("prefixUnset")}</span>
              )}
            </TableCell>
            <TableCell className="text-right">
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
                  <DropdownMenuItem onClick={() => onViewDetail(account)}>
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
                  <DropdownMenuItem onClick={() => onEditFields(account)}>
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
                    onClick={() => onDelete(account)}
                    className={cn("text-destructive focus:text-destructive")}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("actionDelete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
