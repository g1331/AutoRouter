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
import { useRevokeAPIKey } from "@/hooks/use-api-keys";
import type { APIKey } from "@/types/api";

interface RevokeKeyDialogProps {
  apiKey: APIKey | null;
  open: boolean;
  onClose: () => void;
}

/**
 * M3 Revoke API Key Confirmation Dialog
 */
export function RevokeKeyDialog({
  apiKey,
  open,
  onClose,
}: RevokeKeyDialogProps) {
  const revokeMutation = useRevokeAPIKey();

  const handleRevoke = async () => {
    if (!apiKey) return;

    try {
      await revokeMutation.mutateAsync(apiKey.id);
      onClose();
    } catch {
      // Error already handled by mutation onError
    }
  };

  if (!apiKey) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--shape-corner-medium)] bg-[rgb(var(--md-sys-color-error-container))] flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-[rgb(var(--md-sys-color-on-error-container))]" />
            </div>
            撤销 API Key
          </DialogTitle>
          <DialogDescription>
            此操作无法撤销，确定要撤销以下 API Key 吗？
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
                  {apiKey.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="type-label-large text-[rgb(var(--md-sys-color-on-error-container))]">
                  Key 前缀：
                </span>
                <code className="type-body-medium font-mono text-[rgb(var(--md-sys-color-on-error-container))]">
                  {apiKey.key_prefix}
                </code>
              </div>
              {apiKey.description && (
                <div className="flex justify-between">
                  <span className="type-label-large text-[rgb(var(--md-sys-color-on-error-container))]">
                    描述：
                  </span>
                  <span className="type-body-medium text-[rgb(var(--md-sys-color-on-error-container))] max-w-xs text-right truncate">
                    {apiKey.description}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3 bg-[rgb(var(--md-sys-color-warning-container))] rounded-[var(--shape-corner-medium)] p-3">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-[rgb(var(--md-sys-color-on-warning-container))]" />
            <p className="type-body-small text-[rgb(var(--md-sys-color-on-warning-container))]">
              撤销后，使用此 Key 的所有客户端将立即失去访问权限
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={revokeMutation.isPending}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={handleRevoke}
            disabled={revokeMutation.isPending}
          >
            {revokeMutation.isPending ? "撤销中..." : "确认撤销"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
