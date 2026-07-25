"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAPIKeys } from "@/hooks/use-api-keys";
import { useRevokeApiKeyOwner } from "@/hooks/use-users";
import type { User } from "@/types/api";

interface UserKeysDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 启用容器变形动画（View Transition）。 */
  morph?: boolean;
  /** 容器变形使用的 view-transition-name，须与 CSS 具名过渡对应。 */
  morphName?: string;
}

/**
 * 名下密钥对话框：列出归属于该用户的密钥（含成员自建的密钥，这些密钥不在全局密钥
 * 列表的默认范围内），并可解除归属把密钥退回无归属池。
 */
export function UserKeysDialog({
  user,
  open,
  onOpenChange,
  morph = false,
  morphName = "morph-user-row",
}: UserKeysDialogProps) {
  const t = useTranslations("users");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" morph={morph} morphName={morphName}>
        <DialogHeader>
          <DialogTitle>{t("userKeysTitle")}</DialogTitle>
          <DialogDescription>{t("userKeysDesc", { name: user.display_name })}</DialogDescription>
        </DialogHeader>

        {/* Only query while open — the dialog stays mounted for the active row. */}
        {open && <UserKeysList userId={user.id} />}
      </DialogContent>
    </Dialog>
  );
}

function UserKeysList({ userId }: { userId: string }) {
  const t = useTranslations("users");
  const tKeys = useTranslations("keys");
  const tCommon = useTranslations("common");
  const { data, isLoading } = useAPIKeys(1, 100, "", { userId });
  const revokeMutation = useRevokeApiKeyOwner();

  const keys = data?.items ?? [];

  return (
    <div className="max-h-72 space-y-2 overflow-y-auto rounded-cf-sm border border-divider bg-surface-200/60 p-3">
      {isLoading ? (
        <div className="py-6 text-center type-body-small text-muted-foreground">
          {tCommon("loading")}
        </div>
      ) : keys.length === 0 ? (
        <div className="py-6 text-center type-body-small text-muted-foreground">{t("noKeys")}</div>
      ) : (
        keys.map((key) => (
          <div
            key={key.id}
            className="flex items-center justify-between gap-3 rounded-cf-sm border border-divider/70 bg-surface-300/40 px-3 py-2"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <p className="type-body-medium truncate text-foreground">{key.name}</p>
                <Badge variant={key.is_active ? "success" : "neutral"} className="shrink-0">
                  {key.is_active ? tKeys("enabled") : tKeys("disabled")}
                </Badge>
              </div>
              <p className="type-caption font-mono text-muted-foreground">{key.key_prefix}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => revokeMutation.mutate({ keyId: key.id })}
              disabled={revokeMutation.isPending && revokeMutation.variables?.keyId === key.id}
            >
              {t("revokeKeyOwnership")}
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
