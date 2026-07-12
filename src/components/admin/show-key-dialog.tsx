"use client";

import { useState } from "react";
import { Copy, Check, AlertTriangle, CheckCircle } from "lucide-react";
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
  const t = useTranslations("keys");
  const tCommon = useTranslations("common");

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(apiKey.key_value);
      setCopied(true);
      toast.success(t("keyCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(tCommon("error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-cf-md bg-status-success-muted flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-status-success" />
            </div>
            {t("keyCreated")}
          </DialogTitle>
          {/* 同一句警示已由下方 amber 横幅醒目呈现；此处保留为对话框的可访问描述
              （满足 Radix 的 aria-describedby），但视觉上隐藏以避免重复。 */}
          <DialogDescription className="sr-only">{t("keyCreatedDesc")}</DialogDescription>
        </DialogHeader>

        {/* Warning Banner */}
        <div className="bg-status-warning-muted rounded-cf-md p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-status-warning flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="type-label-large text-status-warning">{t("keyCreatedDesc")}</p>
          </div>
        </div>

        {/* Key Info */}
        <div className="space-y-4">
          <div>
            <label className="type-label-large text-muted-foreground mb-2 block">
              {t("keyValue")}
            </label>
            <div className="flex gap-2">
              <div className="flex-1 rounded-cf-md border border-divider bg-surface-300 p-4 font-mono type-body-medium text-status-success break-all">
                {apiKey.key_value}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={copyKey}
                aria-label={copied ? t("keyCopied") : t("copyKey")}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-status-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="type-label-large text-muted-foreground mb-1 block">
                {tCommon("name")}
              </label>
              <div className="type-body-medium text-foreground bg-surface-200 rounded-cf-md p-3">
                {apiKey.name}
              </div>
            </div>
            <div>
              <label className="type-label-large text-muted-foreground mb-1 block">
                {t("tableKeyPrefix")}
              </label>
              <div className="type-body-medium text-foreground bg-surface-200 rounded-cf-md p-3">
                <code className="font-mono">{apiKey.key_prefix}</code>
              </div>
            </div>
          </div>

          {apiKey.description && (
            <div>
              <label className="type-label-large text-muted-foreground mb-1 block">
                {tCommon("description")}
              </label>
              <div className="type-body-medium text-foreground bg-surface-200 rounded-cf-md p-3">
                {apiKey.description}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>{tCommon("close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
