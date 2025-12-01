"use client";

import { useState } from "react";
import { Copy, Check, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { APIKeyCreateResponse } from "@/types/api";

interface ShowKeyDialogProps {
  apiKey: APIKeyCreateResponse;
  open: boolean;
  onClose: () => void;
}

/**
 * M3 Show API Key Dialog (One-time view)
 */
export function ShowKeyDialog({ apiKey, open, onClose }: ShowKeyDialogProps) {
  const [copied, setCopied] = useState(false);

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(apiKey.key);
      setCopied(true);
      toast.success("API Key 已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--shape-corner-medium)] bg-[rgb(var(--md-sys-color-success-container))] flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-[rgb(var(--md-sys-color-on-success-container))]" />
            </div>
            API Key 创建成功
          </DialogTitle>
          <DialogDescription>
            请立即复制并保存此 Key，关闭后将无法再次查看完整内容
          </DialogDescription>
        </DialogHeader>

        {/* Warning Banner */}
        <div className="bg-[rgb(var(--md-sys-color-warning-container))] rounded-[var(--shape-corner-medium)] p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-[rgb(var(--md-sys-color-on-warning-container))] flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="type-label-large text-[rgb(var(--md-sys-color-on-warning-container))]">
              重要提示
            </p>
            <p className="type-body-small text-[rgb(var(--md-sys-color-on-warning-container))]">
              这是唯一一次可以查看完整 API Key
              的机会。关闭此对话框后，系统将只显示 Key 的前缀部分。
              请务必将完整的 Key 复制并保存到安全的地方。
            </p>
          </div>
        </div>

        {/* Key Info */}
        <div className="space-y-4">
          <div>
            <label className="type-label-large text-[rgb(var(--md-sys-color-on-surface-variant))] mb-2 block">
              API Key
            </label>
            <div className="flex gap-2">
              <div className="flex-1 bg-[rgb(var(--md-sys-color-inverse-surface))] rounded-[var(--shape-corner-medium)] p-4 font-mono type-body-medium text-[rgb(var(--md-sys-color-success))] break-all">
                {apiKey.key}
              </div>
              <Button variant="outline" size="icon" onClick={copyKey}>
                {copied ? (
                  <Check className="h-4 w-4 text-[rgb(var(--md-sys-color-success))]" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="type-label-large text-[rgb(var(--md-sys-color-on-surface-variant))] mb-1 block">
                名称
              </label>
              <div className="type-body-medium text-[rgb(var(--md-sys-color-on-surface))] bg-[rgb(var(--md-sys-color-surface-container-low))] rounded-[var(--shape-corner-medium)] p-3">
                {apiKey.name}
              </div>
            </div>
            <div>
              <label className="type-label-large text-[rgb(var(--md-sys-color-on-surface-variant))] mb-1 block">
                Key 前缀
              </label>
              <div className="type-body-medium text-[rgb(var(--md-sys-color-on-surface))] bg-[rgb(var(--md-sys-color-surface-container-low))] rounded-[var(--shape-corner-medium)] p-3">
                <code className="font-mono">{apiKey.key_prefix}</code>
              </div>
            </div>
          </div>

          {apiKey.description && (
            <div>
              <label className="type-label-large text-[rgb(var(--md-sys-color-on-surface-variant))] mb-1 block">
                描述
              </label>
              <div className="type-body-medium text-[rgb(var(--md-sys-color-on-surface))] bg-[rgb(var(--md-sys-color-surface-container-low))] rounded-[var(--shape-corner-medium)] p-3">
                {apiKey.description}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>我已保存，关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
