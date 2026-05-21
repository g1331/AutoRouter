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
import { useCreateCliproxySingleAccountUpstream } from "@/hooks/use-cliproxy";
import type { CliproxyAuthAccount } from "@/types/cliproxy";

interface CliproxyAccountUpstreamDialogProps {
  instanceId: string;
  account: CliproxyAuthAccount;
  open: boolean;
  onClose: () => void;
}

/**
 * 将单个 OAuth 账号固定映射为一个上游的确认弹窗。
 */
export function CliproxyAccountUpstreamDialog({
  instanceId,
  account,
  open,
  onClose,
}: CliproxyAccountUpstreamDialogProps) {
  const t = useTranslations("cliproxy");
  const tCommon = useTranslations("common");
  const createMutation = useCreateCliproxySingleAccountUpstream();

  const handleConfirm = async () => {
    try {
      await createMutation.mutateAsync({
        instanceId,
        accountName: account.auth_file_name,
      });
      onClose();
    } catch {
      // 错误已由 mutation 的 onError 提示
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("accountUpstreamDialogTitle")}</DialogTitle>
          <DialogDescription>{t("accountUpstreamDialogDescription")}</DialogDescription>
        </DialogHeader>

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

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={createMutation.isPending}>
            {createMutation.isPending ? t("creatingUpstream") : t("createUpstream")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
