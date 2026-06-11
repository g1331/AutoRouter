"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAllUpstreams } from "@/hooks/use-upstreams";
import { useSetUserUpstreams, useUserUpstreams } from "@/hooks/use-users";
import type { User } from "@/types/api";

interface UserUpstreamsDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 配置可用上游对话框：选择该用户的密钥允许路由到的上游集合，整体替换保存。
 */
export function UserUpstreamsDialog({ user, open, onOpenChange }: UserUpstreamsDialogProps) {
  const { data: currentUpstreams, isLoading: currentLoading } = useUserUpstreams(user.id, open);
  const { data: allUpstreams, isLoading: allLoading } = useAllUpstreams();
  const setMutation = useSetUserUpstreams();
  const t = useTranslations("users");
  const tCommon = useTranslations("common");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // 将服务端当前授权上游同步到本地可编辑选择
  useEffect(() => {
    if (currentUpstreams) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步服务端数据到可编辑的本地选择状态
      setSelectedIds(new Set(currentUpstreams.upstream_ids));
    }
  }, [currentUpstreams]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const onSave = async () => {
    try {
      await setMutation.mutateAsync({ id: user.id, upstreamIds: Array.from(selectedIds) });
      onOpenChange(false);
    } catch {
      // 错误已由 mutation onError 处理
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = (allUpstreams ?? []).filter((upstream) => {
    if (!normalizedSearch) {
      return true;
    }
    const text = [upstream.name, upstream.description ?? ""].join(" ").toLowerCase();
    return text.includes(normalizedSearch);
  });
  const isLoading = currentLoading || allLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("configureUpstreamsTitle")}</DialogTitle>
          <DialogDescription>{t("configureUpstreamsDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchUpstreams")}
              aria-label={t("searchUpstreams")}
              className="pl-9"
            />
          </div>

          <p className="type-body-small text-muted-foreground">
            {t("upstreamsSelected", {
              selected: selectedIds.size,
              total: allUpstreams?.length ?? 0,
            })}
          </p>

          <div className="max-h-64 space-y-2 overflow-y-auto rounded-cf-sm border border-divider bg-surface-200/60 p-3">
            {isLoading ? (
              <div className="py-6 text-center type-body-small text-muted-foreground">
                {tCommon("loading")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center type-body-small text-muted-foreground">
                {t("noUpstreams")}
              </div>
            ) : (
              filtered.map((upstream) => (
                <label
                  key={upstream.id}
                  className="flex cursor-pointer items-start gap-3 rounded-cf-sm p-2 transition-colors hover:bg-surface-300/70"
                >
                  <Checkbox
                    checked={selectedIds.has(upstream.id)}
                    onCheckedChange={() => toggle(upstream.id)}
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="type-body-medium text-foreground">{upstream.name}</p>
                    {upstream.description && (
                      <p className="type-body-small text-muted-foreground">
                        {upstream.description}
                      </p>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={onSave} disabled={setMutation.isPending || isLoading}>
            {setMutation.isPending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
