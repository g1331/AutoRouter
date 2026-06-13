"use client";

import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteUser } from "@/hooks/use-users";
import type { User } from "@/types/api";

interface DeleteUserDialogProps {
  user: User | null;
  open: boolean;
  onClose: () => void;
  /** 启用容器变形动画（View Transition）。 */
  morph?: boolean;
  /** 容器变形使用的 view-transition-name，须与 CSS 具名过渡对应。 */
  morphName?: string;
}

/**
 * 删除用户确认对话框：删除后其名下密钥被解除归属但保留，最后一个启用管理员由服务端兜底拒绝。
 */
export function DeleteUserDialog({
  user,
  open,
  onClose,
  morph = false,
  morphName = "morph-user-row",
}: DeleteUserDialogProps) {
  const mutation = useDeleteUser();
  const t = useTranslations("users");
  const tCommon = useTranslations("common");

  const handleDelete = async () => {
    if (!user) {
      return;
    }
    try {
      await mutation.mutateAsync(user.id);
      onClose();
    } catch {
      // 错误已由 mutation onError 处理（含最后启用管理员的 409 兜底）
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent morph={morph} morphName={morphName}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteUserTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteUserConfirm", { username: user?.username ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={mutation.isPending}
            className="bg-status-error text-white hover:bg-status-error/90"
          >
            {tCommon("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
