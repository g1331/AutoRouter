"use client";

import { useRef } from "react";
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
  onEdit: (instance: CliproxyInstance, source: HTMLElement | null) => void;
  onTest: (instance: CliproxyInstance) => void;
  onCreatePoolUpstream: (instance: CliproxyInstance) => void;
  onDelete: (instance: CliproxyInstance, source: HTMLElement | null) => void;
}

/** 实例选择列表，保留每个实例原有的启停与管理操作。 */
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
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const rowSource = (id: string) => rowRefs.current.get(id) ?? null;
  const singleInstance = instances.length === 1;

  return (
    <Table frame="none" className="table-fixed" containerClassName="rounded-none bg-transparent">
      <TableHeader className="sr-only">
        <TableRow>
          <TableHead>{t("columnName")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="bg-transparent">
        {instances.map((instance) => (
          <TableRow
            key={instance.id}
            data-morph-source
            ref={(el) => {
              if (el) rowRefs.current.set(instance.id, el);
              else rowRefs.current.delete(instance.id);
            }}
            onClick={() => onSelect(instance)}
            data-state={
              !singleInstance && selectedInstanceId === instance.id ? "selected" : undefined
            }
            className="cursor-pointer last:border-b-0 data-[state=selected]:!bg-transparent data-[state=selected]:[&>td]:border-l-2 data-[state=selected]:[&>td]:border-primary"
          >
            <TableCell className="p-0 align-top">
              <div
                className={cn(
                  "flex min-w-0 items-start gap-2 px-3 py-3",
                  singleInstance && "lg:items-center lg:gap-3 lg:px-4 lg:py-2.5"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    instance.enabled ? "bg-status-success" : "bg-muted-foreground/50"
                  )}
                />
                <div
                  className={cn(
                    "min-w-0 flex-1 space-y-2",
                    singleInstance && "lg:flex lg:items-center lg:gap-4 lg:space-y-0"
                  )}
                >
                  <button
                    type="button"
                    className="block max-w-full truncate rounded-cf-sm text-left font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-pressed={selectedInstanceId === instance.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(instance);
                    }}
                  >
                    {instance.name}
                  </button>
                  <p
                    className={cn(
                      "truncate type-body-small text-muted-foreground",
                      singleInstance ? "lg:min-w-0 lg:max-w-[40%]" : "hidden lg:block"
                    )}
                    title={instance.base_url}
                  >
                    {instance.base_url}
                  </p>
                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-2",
                      singleInstance && "lg:ml-auto lg:shrink-0"
                    )}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Badge variant="secondary" className="hidden lg:inline-flex">
                      {instance.mode === "managed" ? t("modeManaged") : t("modeExternal")}
                    </Badge>
                    <Switch
                      checked={instance.enabled}
                      disabled={
                        toggleEnabled.isPending && toggleEnabled.variables?.id === instance.id
                      }
                      onCheckedChange={(checked) =>
                        toggleEnabled.mutate({ id: instance.id, enabled: checked })
                      }
                      aria-label={instance.enabled ? t("statusEnabled") : t("statusDisabled")}
                    />
                    <span
                      className={cn(
                        "type-body-small text-muted-foreground",
                        instances.length > 1 && "xl:hidden"
                      )}
                    >
                      {instance.enabled ? t("statusEnabled") : t("statusDisabled")}
                    </span>
                  </div>
                </div>
                <div onClick={(event) => event.stopPropagation()}>
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
                      <DropdownMenuItem onClick={() => onEdit(instance, rowSource(instance.id))}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {t("actionEdit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(instance, rowSource(instance.id))}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("actionDelete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
