"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCliproxyAccountModels } from "@/hooks/use-cliproxy";

interface CliproxyAccountModelsDialogProps {
  instanceId: string;
  authFileName: string;
  open: boolean;
  onClose: () => void;
}

/**
 * 展示某 OAuth 账号在 CLIProxyAPI 侧的可用模型列表。
 *
 * 模型列表为只读窗口，数据每次打开时实时从上游拉取，不写入本地缓存。
 */
export function CliproxyAccountModelsDialog({
  instanceId,
  authFileName,
  open,
  onClose,
}: CliproxyAccountModelsDialogProps) {
  const t = useTranslations("cliproxy");
  const tCommon = useTranslations("common");
  const { data: models, isLoading, isError } = useCliproxyAccountModels(instanceId, authFileName);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("accountModelsDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("accountFileLabel")}: {authFileName}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-96 overflow-y-auto py-2">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              <span className="type-body-small">{tCommon("loading")}</span>
            </div>
          ) : isError ? (
            <p className="py-8 text-center type-body-medium text-destructive">
              {t("accountModelsLoadFailed")}
            </p>
          ) : !models || models.length === 0 ? (
            <p className="py-8 text-center type-body-medium text-muted-foreground">
              {t("accountModelsEmpty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{t("columnName")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell>
                      <code className="type-body-small font-mono">{model.id}</code>
                    </TableCell>
                    <TableCell>{model.display_name ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>{tCommon("close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
