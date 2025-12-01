"use client";

import { AlertTriangle } from "lucide-react";
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
}

/**
 * M3 Delete Upstream Confirmation Dialog
 */
export function DeleteUpstreamDialog({
  upstream,
  open,
  onClose,
}: DeleteUpstreamDialogProps) {
  const deleteMutation = useDeleteUpstream();

  const handleDelete = async () => {
    if (!upstream) return;

    try {
      await deleteMutation.mutateAsync(upstream.id);
      onClose();
    } catch {
      // Error already handled by mutation onError
    }
  };

  if (!upstream) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--shape-corner-medium)] bg-[rgb(var(--md-sys-color-error-container))] flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-[rgb(var(--md-sys-color-on-error-container))]" />
            </div>
            删除 Upstream
          </DialogTitle>
          <DialogDescription>
            此操作无法撤销，确定要删除以下 Upstream 吗？
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <div className="bg-[rgb(var(--md-sys-color-error-container))] rounded-[var(--shape-corner-medium)] p-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="type-label-large text-[rgb(var(--md-sys-color-on-error-container))]">
                  名称：
                </span>
                <span className="type-body-medium text-[rgb(var(--md-sys-color-on-error-container))]">
                  {upstream.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="type-label-large text-[rgb(var(--md-sys-color-on-error-container))]">
                  Provider：
                </span>
                <span className="type-body-medium text-[rgb(var(--md-sys-color-on-error-container))]">
                  {upstream.provider}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="type-label-large text-[rgb(var(--md-sys-color-on-error-container))]">
                  Base URL：
                </span>
                <code className="type-body-medium font-mono text-[rgb(var(--md-sys-color-on-error-container))] max-w-xs text-right truncate">
                  {upstream.base_url}
                </code>
              </div>
              {upstream.description && (
                <div className="flex justify-between">
                  <span className="type-label-large text-[rgb(var(--md-sys-color-on-error-container))]">
                    描述：
                  </span>
                  <span className="type-body-medium text-[rgb(var(--md-sys-color-on-error-container))] max-w-xs text-right truncate">
                    {upstream.description}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3 bg-[rgb(var(--md-sys-color-warning-container))] rounded-[var(--shape-corner-medium)] p-3">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-[rgb(var(--md-sys-color-on-warning-container))]" />
            <p className="type-body-small text-[rgb(var(--md-sys-color-on-warning-container))]">
              删除后，关联此 Upstream 的所有 API Keys 将无法再路由到此上游服务
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={deleteMutation.isPending}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "删除中..." : "确认删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
