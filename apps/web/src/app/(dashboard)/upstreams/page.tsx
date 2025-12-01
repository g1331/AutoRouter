"use client";

import { useState } from "react";
import { Topbar } from "@/components/admin/topbar";
import { UpstreamsTable } from "@/components/admin/upstreams-table";
import { UpstreamFormDialog } from "@/components/admin/upstream-form-dialog";
import { DeleteUpstreamDialog } from "@/components/admin/delete-upstream-dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useUpstreams } from "@/hooks/use-upstreams";
import type { Upstream } from "@/types/api";

/**
 * Upstreams 管理页面
 */
export default function UpstreamsPage() {
  const [page, setPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editUpstream, setEditUpstream] = useState<Upstream | null>(null);
  const [deleteUpstream, setDeleteUpstream] = useState<Upstream | null>(null);
  const pageSize = 10;

  const { data, isLoading } = useUpstreams(page, pageSize);

  return (
    <>
      <Topbar title="Upstreams" />
      <div className="px-8 py-6 space-y-6 bg-[rgb(var(--md-sys-color-surface-container))] min-h-screen">
        {/* 操作栏 */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="type-title-large text-[rgb(var(--md-sys-color-on-surface))]">Upstreams 管理</h3>
            <p className="type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))] mt-1">
              配置和管理上游 AI 服务提供商
            </p>
          </div>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            variant="tonal"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            添加 Upstream
          </Button>
        </div>

        {/* 表格 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-[3px] border-[rgb(var(--md-sys-color-outline-variant))] border-t-[rgb(var(--md-sys-color-tertiary))] rounded-full animate-spin"></div>
              <p className="type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))]">加载中...</p>
            </div>
          </div>
        ) : (
          <>
            <UpstreamsTable
              upstreams={data?.items || []}
              onEdit={setEditUpstream}
              onDelete={setDeleteUpstream}
            />

            {/* 分页 */}
            {data && data.total_pages > 1 && (
              <div className="flex items-center justify-between bg-[rgb(var(--md-sys-color-surface))] rounded-[var(--shape-corner-large)] px-6 py-4 border border-[rgb(var(--md-sys-color-outline-variant))]">
                <div className="type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))]">
                  共 {data.total} 个 Upstreams，第 {data.page} / {data.total_pages} 页
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="tonal"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    上一页
                  </Button>
                  <Button
                    variant="tonal"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page === data.total_pages}
                    className="gap-1"
                  >
                    下一页
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 创建对话框 */}
      <UpstreamFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {/* 编辑对话框 */}
      <UpstreamFormDialog
        upstream={editUpstream}
        open={!!editUpstream}
        onOpenChange={(open) => !open && setEditUpstream(null)}
      />

      {/* 删除确认对话框 */}
      <DeleteUpstreamDialog
        upstream={deleteUpstream}
        open={!!deleteUpstream}
        onClose={() => setDeleteUpstream(null)}
      />
    </>
  );
}
