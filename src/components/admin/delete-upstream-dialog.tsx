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
import { useDeleteUpstream } from "@/hooks/use-upstreams";
import type { Upstream } from "@/types/api";

interface DeleteUpstreamDialogProps {
  upstream: Upstream | null;
  open: boolean;
  onClose: () => void;
  /** 启用容器变形动画（View Transition）。 */
  morph?: boolean;
}

/**
 * M3 Delete Upstream Confirmation Dialog
 */
export function DeleteUpstreamDialog({
  upstream,
  open,
  onClose,
  morph = false,
}: DeleteUpstreamDialogProps) {
  const deleteMutation = useDeleteUpstream();
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");

  const handleDelete = async () => {
    if (!upstream) return;

    try {
      await deleteMutation.mutateAsync(upstream.id);
      onClose();
    } catch {
      // Error already handled by mutation onError
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onClose();
    }
  };

  if (!upstream) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" morph={morph} morphName="morph-upstream-delete">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-cf-md bg-status-error-muted flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-status-error" />
            </div>
            {t("deleteUpstreamTitle")}
          </DialogTitle>
          <DialogDescription>{t("deleteUpstreamDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <div className="bg-status-error-muted rounded-cf-md p-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="type-label-large text-status-error">{tCommon("name")}:</span>
                <span className="type-body-medium text-status-error">{upstream.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="type-label-large text-status-error">{t("baseUrl")}:</span>
                <code className="type-body-medium font-mono text-status-error max-w-xs text-right truncate">
                  {upstream.base_url}
                </code>
              </div>
              {upstream.description && (
                <div className="flex justify-between">
                  <span className="type-label-large text-status-error">
                    {tCommon("description")}:
                  </span>
                  <span className="type-body-medium text-status-error max-w-xs text-right truncate">
                    {upstream.description}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3 bg-status-warning-muted rounded-cf-md p-3">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-status-warning" />
            <p className="type-body-small text-status-warning">{t("deleteUpstreamWarning")}</p>
          </div>
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
