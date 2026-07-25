"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Key, Plus } from "lucide-react";

import { CreateKeyDialog } from "@/components/admin/create-key-dialog";
import { KeysTable, type KeyOwnerScope } from "@/components/admin/keys-table";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { RevokeKeyDialog } from "@/components/admin/revoke-key-dialog";
import { Topbar } from "@/components/admin/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAPIKeys } from "@/hooks/use-api-keys";
import { useContainerMorph } from "@/hooks/use-container-morph";
import { cn } from "@/lib/utils";
import type { APIKey } from "@/types/api";

interface KeysLoadingSkeletonProps {
  loadingLabel: string;
}

function KeysLoadingSkeleton({ loadingLabel }: KeysLoadingSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={loadingLabel}
      className="overflow-hidden rounded-cf-md border border-divider/85 bg-surface-200/55"
    >
      <div className="border-b border-divider bg-surface-300/70 px-4 py-2.5">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-400/70" />
          <div className="col-span-3 h-3 animate-pulse rounded-cf-sm bg-surface-400/70" />
          <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-400/70" />
          <div className="col-span-1 h-3 animate-pulse rounded-cf-sm bg-surface-400/70" />
          <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-400/70" />
          <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-400/70" />
        </div>
      </div>

      <div className="divide-y divide-divider/70">
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={`keys-loading-row-${index}`}
            className="grid grid-cols-12 items-center gap-3 px-4 py-3"
          >
            <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-300/80" />
            <div className="col-span-3 h-3 animate-pulse rounded-cf-sm bg-surface-300/80" />
            <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-300/80" />
            <div className="col-span-1 h-3 animate-pulse rounded-cf-sm bg-surface-300/80" />
            <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-300/80" />
            <div className="col-span-2 h-8 animate-pulse rounded-cf-sm bg-surface-300/80" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function KeysPage() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [ownerScope, setOwnerScope] = useState<KeyOwnerScope>("unowned");
  const [revokeKey, setRevokeKey] = useState<APIKey | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const pageSize = 10;

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
    setPage(1);
  }, []);

  // 容器变形动画：记录触发弹窗的源元素（表格行 / 卡片），关闭时收回同一元素。
  // 撤销与新建各用独立的源引用，避免相互覆盖。
  const { startMorph, canMorph } = useContainerMorph();
  const morphSourceRef = useRef<HTMLElement | null>(null);
  const createMorphSourceRef = useRef<HTMLElement | null>(null);

  const t = useTranslations("keys");
  const tCommon = useTranslations("common");
  const { data, isLoading, isFetching } = useAPIKeys(page, pageSize, searchQuery, { ownerScope });

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <span className="type-body-medium text-muted-foreground">{t("managementDesc")}</span>
          </div>
          <Button
            onClick={(event) => {
              const source = event.currentTarget;
              createMorphSourceRef.current = source;
              startMorph(() => setCreateDialogOpen(true), {
                source,
                name: "morph-key-form",
                mode: "enter",
              });
            }}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("createKey")}
          </Button>
        </div>

        {isLoading ? (
          <KeysLoadingSkeleton loadingLabel={tCommon("loading")} />
        ) : (
          // Dim the stale placeholder content while a search/page refetch is
          // in flight — the only in-place feedback since the skeleton is
          // reserved for the initial load.
          <div
            aria-busy={isFetching}
            className={cn("space-y-4 transition-opacity", isFetching && "opacity-70")}
          >
            <KeysTable
              keys={data?.items || []}
              searchQuery={searchQuery}
              onSearchQueryChange={handleSearchQueryChange}
              ownerScope={ownerScope}
              onOwnerScopeChange={(scope) => {
                setOwnerScope(scope);
                setPage(1);
              }}
              onRevoke={(key, source) => {
                morphSourceRef.current = source;
                startMorph(() => setRevokeKey(key), {
                  source,
                  name: "morph-key-revoke",
                  mode: "enter",
                });
              }}
            />

            {/* While searching, keep the controls visible even on a single
                page — the total is the only match-count feedback. */}
            {data && (data.total_pages > 1 || searchQuery.trim() !== "") && (
              <Card variant="filled" className="border border-divider">
                <PaginationControls
                  total={data.total}
                  page={page}
                  totalPages={data.total_pages}
                  onPageChange={setPage}
                  className="p-4"
                />
              </Card>
            )}
          </div>
        )}
      </div>

      <RevokeKeyDialog
        apiKey={revokeKey}
        open={!!revokeKey}
        onClose={() => {
          startMorph(() => setRevokeKey(null), {
            source: morphSourceRef.current,
            name: "morph-key-revoke",
            mode: "exit",
          });
        }}
        morph={canMorph}
      />

      <CreateKeyDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setCreateDialogOpen(true);
          } else {
            startMorph(() => setCreateDialogOpen(false), {
              source: createMorphSourceRef.current,
              name: "morph-key-form",
              mode: "exit",
            });
          }
        }}
        morph={canMorph}
        morphName="morph-key-form"
      />
    </>
  );
}
