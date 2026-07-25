"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useSetUsersUpstreamVisibility } from "@/hooks/use-users";

/**
 * 批量设置全体成员的上游可见性。以确认对话框防误触，提供“全部可见 / 全部隐藏”
 * 两个动作，成功后由 mutation 的 toast 反馈受影响用户数。切到隐藏会在服务端把这些
 * 成员的密钥重对齐到各自授权全集。
 */
export function BulkUpstreamVisibilityDialog() {
  const [open, setOpen] = useState(false);
  const mutation = useSetUsersUpstreamVisibility();
  const t = useTranslations("users");
  const tCommon = useTranslations("common");

  const apply = async (exposeUpstreams: boolean) => {
    try {
      await mutation.mutateAsync({ expose_upstreams: exposeUpstreams });
      setOpen(false);
    } catch {
      // 错误已由 mutation onError 处理
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Eye className="h-4 w-4" aria-hidden="true" />
          {t("bulkVisibilityTitle")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("bulkVisibilityTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("bulkVisibilityDesc")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // 阻止默认关闭，等待 mutation 完成后再关，避免中途报错却已关闭对话框。
              event.preventDefault();
              apply(false);
            }}
            disabled={mutation.isPending}
            className="bg-surface-300 text-foreground hover:bg-surface-300/80"
          >
            {t("bulkVisibilityHideAll")}
          </AlertDialogAction>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              apply(true);
            }}
            disabled={mutation.isPending}
          >
            {t("bulkVisibilityShowAll")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
