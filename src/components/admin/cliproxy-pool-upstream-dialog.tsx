"use client";

import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateCliproxyPoolUpstream } from "@/hooks/use-cliproxy";
import { CLIPROXY_UPSTREAM_PROVIDERS } from "@/types/cliproxy";
import type { CliproxyUpstreamProvider } from "@/types/cliproxy";

interface CliproxyPoolUpstreamDialogProps {
  instanceId: string;
  open: boolean;
  onClose: () => void;
}

const PROVIDER_LABEL_KEY: Record<CliproxyUpstreamProvider, string> = {
  codex: "providerCodex",
  anthropic: "providerAnthropic",
  gemini: "providerGemini",
};

/**
 * 按服务商一键创建 OAuth 池上游的确认弹窗。
 */
export function CliproxyPoolUpstreamDialog({
  instanceId,
  open,
  onClose,
}: CliproxyPoolUpstreamDialogProps) {
  const t = useTranslations("cliproxy");
  const tCommon = useTranslations("common");
  const createMutation = useCreateCliproxyPoolUpstream();
  const [provider, setProvider] = useState<CliproxyUpstreamProvider>("codex");

  const handleConfirm = async () => {
    try {
      await createMutation.mutateAsync({ instanceId, provider });
      onClose();
    } catch {
      // 错误已由 mutation 的 onError 提示
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("poolUpstreamDialogTitle")}</DialogTitle>
          <DialogDescription>{t("poolUpstreamDialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <p className="type-body-small text-muted-foreground">{t("poolUpstreamProvider")}</p>
          <Select
            value={provider}
            onValueChange={(value) => setProvider(value as CliproxyUpstreamProvider)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIPROXY_UPSTREAM_PROVIDERS.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(PROVIDER_LABEL_KEY[item])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={createMutation.isPending}>
            {createMutation.isPending ? t("creatingUpstream") : t("createUpstream")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
