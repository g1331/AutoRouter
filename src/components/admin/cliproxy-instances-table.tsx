"use client";

import { Boxes, MoreHorizontal, Pencil, PlugZap, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToggleCliproxyInstanceEnabled } from "@/hooks/use-cliproxy";
import { cn } from "@/lib/utils";
import type { CliproxyInstance } from "@/types/cliproxy";

interface CliproxyInstancesTableProps {
  instances: CliproxyInstance[];
  selectedInstanceId: string | null;
  onSelect: (instance: CliproxyInstance) => void;
  onEdit: (instance: CliproxyInstance) => void;
  onTest: (instance: CliproxyInstance) => void;
  onCreatePoolUpstream: (instance: CliproxyInstance) => void;
  onDelete: (instance: CliproxyInstance) => void;
}

/**
 * CLIProxyAPI 实例列表表格。点击行选中实例以查看其账号，每行提供启停切换、
 * 连通性检测、编辑、删除等操作。
 */
export function CliproxyInstancesTable({
  instances,
  selectedInstanceId,
  onSelect,
  onEdit,
  onTest,
  onCreatePoolUpstream,
  onDelete,
}: CliproxyInstancesTableProps) {
  const t = useTranslations("cliproxy");
  const toggleEnabled = useToggleCliproxyInstanceEnabled();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columnName")}</TableHead>
          <TableHead>{t("columnMode")}</TableHead>
          <TableHead>{t("columnBaseUrl")}</TableHead>
          <TableHead>{t("columnStatus")}</TableHead>
          <TableHead className="w-16 text-right">{t("columnActions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {instances.map((instance) => (
          <TableRow
            key={instance.id}
            onClick={() => onSelect(instance)}
            data-state={selectedInstanceId === instance.id ? "selected" : undefined}
            className="cursor-pointer"
          >
            <TableCell className="font-medium">{instance.name}</TableCell>
            <TableCell>
              <Badge variant="secondary">
                {instance.mode === "managed" ? t("modeManaged") : t("modeExternal")}
              </Badge>
            </TableCell>
            <TableCell>
              <code className="type-body-small font-mono text-muted-foreground">
                {instance.base_url}
              </code>
            </TableCell>
            <TableCell onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center gap-2">
                <Switch
                  checked={instance.enabled}
                  disabled={toggleEnabled.isPending && toggleEnabled.variables?.id === instance.id}
                  onCheckedChange={(checked) =>
                    toggleEnabled.mutate({ id: instance.id, enabled: checked })
                  }
                  aria-label={instance.enabled ? t("statusEnabled") : t("statusDisabled")}
                />
                <span className="type-body-small text-muted-foreground">
                  {instance.enabled ? t("statusEnabled") : t("statusDisabled")}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
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
                  <DropdownMenuItem onClick={() => onTest(instance)}>
                    <PlugZap className="mr-2 h-4 w-4" />
                    {t("actionTest")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCreatePoolUpstream(instance)}>
                    <Boxes className="mr-2 h-4 w-4" />
                    {t("actionCreatePoolUpstream")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(instance)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t("actionEdit")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDelete(instance)}
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
