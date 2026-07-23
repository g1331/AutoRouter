"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAPIKeys } from "@/hooks/use-api-keys";
import { useAssignApiKeyOwner } from "@/hooks/use-users";
import type { User } from "@/types/api";

interface AssignUserKeysDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 启用容器变形动画（View Transition）。 */
  morph?: boolean;
  /** 容器变形使用的 view-transition-name，须与 CSS 具名过渡对应。 */
  morphName?: string;
}

/**
 * 分配密钥对话框：把已有 API 密钥的归属人设置为该用户。分配生效后用户列表的密钥数随之更新。
 */
export function AssignUserKeysDialog({
  user,
  open,
  onOpenChange,
  morph = false,
  morphName = "morph-user-row",
}: AssignUserKeysDialogProps) {
  // Only unowned keys can be handed to a user; keys another member already
  // owns are managed from that member's own key view.
  const { data, isLoading } = useAPIKeys(1, 100, "", { ownerScope: "unowned" });
  const assignMutation = useAssignApiKeyOwner();
  const t = useTranslations("users");
  const tCommon = useTranslations("common");
  const [search, setSearch] = useState("");

  const keys = data?.items ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = keys.filter((key) => {
    if (!normalizedSearch) {
      return true;
    }
    return [key.name, key.key_prefix].join(" ").toLowerCase().includes(normalizedSearch);
  });

  const handleAssign = async (keyId: string) => {
    try {
      await assignMutation.mutateAsync({ keyId, userId: user.id });
    } catch {
      // 错误已由 mutation onError 处理
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" morph={morph} morphName={morphName}>
        <DialogHeader>
          <DialogTitle>{t("assignKeysTitle")}</DialogTitle>
          <DialogDescription>{t("assignKeysDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchKeys")}
              aria-label={t("searchKeys")}
              className="pl-9"
            />
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto rounded-cf-sm border border-divider bg-surface-200/60 p-3">
            {isLoading ? (
              <div className="py-6 text-center type-body-small text-muted-foreground">
                {tCommon("loading")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center type-body-small text-muted-foreground">
                {t("noKeys")}
              </div>
            ) : (
              filtered.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between gap-3 rounded-cf-sm border border-divider/70 bg-surface-300/40 px-3 py-2"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="type-body-medium truncate text-foreground">{key.name}</p>
                    <p className="type-caption font-mono text-muted-foreground">{key.key_prefix}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => handleAssign(key.id)}
                    disabled={
                      assignMutation.isPending && assignMutation.variables?.keyId === key.id
                    }
                  >
                    {t("assign")}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
