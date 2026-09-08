"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

import { PageShell } from "@/components/admin/page-shell";
import { PageHeader } from "@/components/admin/page-header";
import { QueryStatus } from "@/components/ui/query-status";
import { Topbar } from "@/components/admin/topbar";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { PortalKeyDialog } from "@/components/portal/portal-key-dialog";
import { PortalKeysTable } from "@/components/portal/portal-keys-table";
import { PortalRevokeKeyDialog } from "@/components/portal/portal-revoke-key-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalKeys, usePortalUpstreamOptions } from "@/hooks/use-portal-keys";
import { useContainerMorph } from "@/hooks/use-container-morph";
import type { APIKey } from "@/types/api";

export default function PortalKeysPage() {
  const t = useTranslations("portal");
  const tKeys = useTranslations("keys");
  const tCommon = useTranslations("common");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<APIKey | null>(null);
  const [revokeKey, setRevokeKey] = useState<APIKey | null>(null);
  const pageSize = 10;

  // 容器变形动画：记录触发弹窗的源元素（创建按钮 / 表格行），关闭时收回同一元素。
  const { startMorph, canMorph } = useContainerMorph();
  const morphSourceRef = useRef<HTMLElement | null>(null);

  const { data, isLoading, error, isFetching, refetch } = usePortalKeys(page, pageSize);
  // 上游可见性决定“空上游列表”该如何解读，取不到时按不可见处理（fail closed）。
  const { data: upstreamOptions } = usePortalUpstreamOptions();
  const upstreamsVisible = upstreamOptions?.upstreams_visible ?? false;

  return (
    <>
      <Topbar title={t("keys.pageTitle")} />

      <PageShell maxWidth="7xl">
        <PageHeader
          title={t("keys.pageTitle")}
          actions={
            <Button
              type="button"
              onClick={(event) => {
                const source = event.currentTarget;
                morphSourceRef.current = source;
                startMorph(() => setCreateOpen(true), {
                  source,
                  name: "morph-portal-key-create",
                  mode: "enter",
                });
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {tKeys("createKey")}
            </Button>
          }
        />
        <QueryStatus
          error={error}
          fetching={isFetching && !isLoading}
          hasData={Boolean(data)}
          onRetry={() => void refetch()}
        />

        {error && !data ? null : isLoading ? (
          <Card
            role="status"
            aria-label={tCommon("loading")}
            variant="outlined"
            className="space-y-3 bg-card p-4"
          >
            <span className="sr-only">{tCommon("loading")}</span>
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={`portal-keys-loading-${index}`} className="h-10 w-full" />
            ))}
          </Card>
        ) : (
          <>
            <PortalKeysTable
              keys={data?.items ?? []}
              upstreamsVisible={upstreamsVisible}
              onEdit={(key, source) => {
                morphSourceRef.current = source;
                startMorph(() => setEditingKey(key), {
                  source,
                  name: "morph-portal-key-edit",
                  mode: "enter",
                });
              }}
              onRevoke={(key, source) => {
                morphSourceRef.current = source;
                startMorph(() => setRevokeKey(key), {
                  source,
                  name: "morph-portal-key-revoke",
                  mode: "enter",
                });
              }}
            />

            {data && data.total_pages > 1 && (
              <Card variant="filled" className="border border-transparent bg-surface-400">
                <PaginationControls
                  total={data.total}
                  page={page}
                  totalPages={data.total_pages}
                  onPageChange={setPage}
                  className="p-4"
                />
              </Card>
            )}
          </>
        )}
      </PageShell>

      <PortalKeyDialog
        mode="create"
        open={createOpen}
        onOpenChange={(open) => {
          if (open) {
            setCreateOpen(true);
          } else {
            startMorph(() => setCreateOpen(false), {
              source: morphSourceRef.current,
              name: "morph-portal-key-create",
              mode: "exit",
            });
          }
        }}
        morph={canMorph}
        morphName="morph-portal-key-create"
      />

      <PortalKeyDialog
        mode="edit"
        apiKey={editingKey}
        open={!!editingKey}
        onOpenChange={(open) => {
          if (!open) {
            startMorph(() => setEditingKey(null), {
              source: morphSourceRef.current,
              name: "morph-portal-key-edit",
              mode: "exit",
            });
          }
        }}
        morph={canMorph}
        morphName="morph-portal-key-edit"
      />

      <PortalRevokeKeyDialog
        apiKey={revokeKey}
        open={!!revokeKey}
        onClose={() => {
          startMorph(() => setRevokeKey(null), {
            source: morphSourceRef.current,
            name: "morph-portal-key-revoke",
            mode: "exit",
          });
        }}
        morph={canMorph}
      />
    </>
  );
}
