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
import { useDeletePortalKey } from "@/hooks/use-portal-keys";
import type { APIKey } from "@/types/api";

interface PortalRevokeKeyDialogProps {
  apiKey: APIKey | null;
  open: boolean;
  onClose: () => void;
  /** 启用容器变形动画（View Transition）。 */
  morph?: boolean;
}

/**
 * Confirmation dialog for deleting one of the caller's own API keys.
 */
export function PortalRevokeKeyDialog({
  apiKey,
  open,
  onClose,
  morph = false,
}: PortalRevokeKeyDialogProps) {
  const t = useTranslations("keys");
  const tCommon = useTranslations("common");
  const deleteMutation = useDeletePortalKey();

  const handleConfirm = async () => {
    if (!apiKey) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(apiKey.id);
    } finally {
      onClose();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <AlertDialogContent morph={morph} morphName="morph-portal-key-revoke">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("revokeKeyTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("revokeKeyDesc")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void handleConfirm()}
            disabled={deleteMutation.isPending}
          >
            {tCommon("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
