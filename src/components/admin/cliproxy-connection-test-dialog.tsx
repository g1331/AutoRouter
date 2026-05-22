"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { useTestCliproxyInstance } from "@/hooks/use-cliproxy";
import type { CliproxyConnectionTestResult, CliproxyInstance } from "@/types/cliproxy";
import { CliproxyConnectionResult } from "./cliproxy-connection-result";

interface CliproxyConnectionTestDialogProps {
  instance: CliproxyInstance;
  open: boolean;
  onClose: () => void;
}

/**
 * 已保存实例的连通性检测弹窗。挂载时自动发起一次检测，并支持重新检测。
 *
 * 由父组件按需挂载，因此每次打开都是全新实例。
 */
export function CliproxyConnectionTestDialog({
  instance,
  open,
  onClose,
}: CliproxyConnectionTestDialogProps) {
  const t = useTranslations("cliproxy");
  const tCommon = useTranslations("common");
  const testMutation = useTestCliproxyInstance();
  const [result, setResult] = useState<CliproxyConnectionTestResult | null>(null);

  const { mutateAsync } = testMutation;

  useEffect(() => {
    let cancelled = false;
    mutateAsync(instance.id)
      .then((res) => {
        if (!cancelled) {
          setResult(res);
        }
      })
      .catch(() => {
        // 网络层错误由 mutation 抛出，此处不展示结果
      });
    return () => {
      cancelled = true;
    };
  }, [instance.id, mutateAsync]);

  const handleRetest = () => {
    setResult(null);
    mutateAsync(instance.id)
      .then(setResult)
      .catch(() => {
        // 错误已抛出
      });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("testInstanceTitle")}</DialogTitle>
          <DialogDescription>{instance.name}</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {testMutation.isPending ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              <span className="type-body-small">{t("testing")}</span>
            </div>
          ) : result ? (
            <CliproxyConnectionResult result={result} />
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={testMutation.isPending} onClick={handleRetest}>
            {t("testConnection")}
          </Button>
          <Button onClick={onClose}>{tCommon("close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
