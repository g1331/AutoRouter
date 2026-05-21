"use client";

import { MoreHorizontal, Pencil, Power, PowerOff } from "lucide-react";
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
import type { CliproxyAuthAccount } from "@/types/cliproxy";

interface CliproxyAccountsTableProps {
  accounts: CliproxyAuthAccount[];
  onToggleStatus: (account: CliproxyAuthAccount) => void;
  onEditFields: (account: CliproxyAuthAccount) => void;
}

/**
 * CLIProxyAPI OAuth 账号列表表格。每行提供启停与字段编辑操作。
 */
export function CliproxyAccountsTable({
  accounts,
  onToggleStatus,
  onEditFields,
}: CliproxyAccountsTableProps) {
  const t = useTranslations("cliproxy");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columnAccountFile")}</TableHead>
          <TableHead>{t("columnProvider")}</TableHead>
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
              <Badge variant={account.disabled ? "secondary" : "success"}>
                {account.disabled ? t("accountStatusDisabled") : t("accountStatusEnabled")}
              </Badge>
            </TableCell>
            <TableCell>{account.model_count}</TableCell>
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
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
