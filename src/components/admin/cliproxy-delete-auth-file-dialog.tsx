"use client";

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
import { useDeleteCliproxyAuthFile } from "@/hooks/use-cliproxy";
import { cn } from "@/lib/utils";
import type { CliproxyAuthAccount } from "@/types/cliproxy";

interface CliproxyDeleteAuthFileDialogProps {
  instanceId: string;
  account: CliproxyAuthAccount | null;
  onClose: () => void;
}

/**
 * 删除认证文件的确认弹窗。删除会先调用 CLIProxyAPI 删除上游文件，
 * 成功后再移除本地缓存。
 */
export function CliproxyDeleteAuthFileDialog({
  instanceId,
  account,
  onClose,
}: CliproxyDeleteAuthFileDialogProps) {
  const t = useTranslations("cliproxy");
  const tCommon = useTranslations("common");
  const deleteMutation = useDeleteCliproxyAuthFile();

  const handleConfirm = async () => {
    if (!account) return;
    try {
      await deleteMutation.mutateAsync({
        instanceId,
        authFileName: account.auth_file_name,
      });
      onClose();
    } catch {
      // 错误已由 mutation 的 onError 提示
    }
  };

  return (
    <Dialog open={Boolean(account)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("deleteAuthFileTitle")}</DialogTitle>
          <DialogDescription>{t("deleteAuthFileDescription")}</DialogDescription>
        </DialogHeader>

        {account ? (
          <div className="py-2">
            <div className="rounded-cf-sm border border-border p-3">
              <div className="flex justify-between gap-3">
                <span className="type-label-large text-muted-foreground">
                  {t("accountFileLabel")}
                </span>
                <span className="type-body-medium">{account.auth_file_name}</span>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tCommon("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={deleteMutation.isPending || !account}
            className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
          >
            {deleteMutation.isPending ? t("deleting") : tCommon("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
