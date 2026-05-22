"use client";

import { AlertTriangle } from "lucide-react";
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
import { useDeleteCliproxyInstance } from "@/hooks/use-cliproxy";
import type { CliproxyInstance } from "@/types/cliproxy";

interface DeleteCliproxyInstanceDialogProps {
  instance: CliproxyInstance | null;
  open: boolean;
  onClose: () => void;
}

/**
 * CLIProxyAPI 实例删除确认弹窗。
 */
export function DeleteCliproxyInstanceDialog({
  instance,
  open,
  onClose,
}: DeleteCliproxyInstanceDialogProps) {
  const t = useTranslations("cliproxy");
  const tCommon = useTranslations("common");
  const deleteMutation = useDeleteCliproxyInstance();

  const handleDelete = async () => {
    if (!instance) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(instance.id);
      onClose();
    } catch {
      // 错误已由 mutation 的 onError 提示
    }
  };

  if (!instance) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden />
            {t("deleteInstanceTitle")}
          </DialogTitle>
          <DialogDescription>{t("deleteInstanceDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-cf-sm border border-border p-3">
            <div className="flex justify-between gap-3">
              <span className="type-label-large text-muted-foreground">{t("fieldName")}</span>
              <span className="type-body-medium">{instance.name}</span>
            </div>
            <div className="mt-2 flex justify-between gap-3">
              <span className="type-label-large text-muted-foreground">{t("fieldBaseUrl")}</span>
              <code className="type-body-small max-w-xs truncate font-mono">
                {instance.base_url}
              </code>
            </div>
          </div>
          <p className="type-body-small text-muted-foreground">{t("deleteInstanceWarning")}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleteMutation.isPending}>
            {tCommon("cancel")}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? t("deleting") : tCommon("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
