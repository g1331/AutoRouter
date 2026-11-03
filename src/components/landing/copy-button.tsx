"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COPIED_RESET_MS = 1600;

interface CopyButtonProps {
  value: string;
  /** 被复制内容的名称，拼进无障碍标签，例如「Base URL」。 */
  target: string;
  className?: string;
}

/** 图标复制按钮：成功后短暂切换为对勾，并通过 live region 播报结果。 */
export function CopyButton({ value, target, className }: CopyButtonProps) {
  const t = useTranslations("landing.connect");
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        aria-label={t("copy", { target })}
        className={cn("h-8 w-8 text-muted-foreground hover:text-foreground", className)}
      >
        {copied ? (
          <Check className="text-status-success" aria-hidden="true" />
        ) : (
          <Copy aria-hidden="true" />
        )}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? t("copied") : ""}
      </span>
    </>
  );
}
