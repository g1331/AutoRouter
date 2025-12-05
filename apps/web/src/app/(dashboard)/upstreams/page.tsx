"use client";

import { useState } from "react";
import { Topbar } from "@/components/admin/topbar";
import { UpstreamsTable } from "@/components/admin/upstreams-table";
import { UpstreamFormDialog } from "@/components/admin/upstream-form-dialog";
import { DeleteUpstreamDialog } from "@/components/admin/delete-upstream-dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Server } from "lucide-react";
import { useUpstreams } from "@/hooks/use-upstreams";
import type { Upstream } from "@/types/api";

/**
 * Cassette Futurism Upstreams 管理页面
 *
 * Terminal-style upstream configuration with:
 * - Amber text on dark background
 * - Glowing borders and indicators
 * - Mono font for data display
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
      <div className="p-6 lg:p-8 space-y-6 bg-surface-100 min-h-screen">
        {/* 操作栏 */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Server className="w-5 h-5 text-amber-500" aria-hidden="true" />
              <h3 className="font-mono text-lg font-medium tracking-wide text-amber-500 cf-glow-text">
                UPSTREAMS 管理
              </h3>
            </div>
            <p className="font-sans text-sm text-amber-700">
              配置和管理上游 AI 服务提供商
            </p>
          </div>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            variant="primary"
            className="gap-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            添加 Upstream
          </Button>
        </div>

        {/* 表格 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-2 border-amber-700 border-t-amber-500 rounded-full animate-spin" />
              <p className="font-mono text-sm text-amber-700">
                LOADING DATA...
              </p>
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
              <div className="flex items-center justify-between bg-surface-200 rounded-cf-sm px-6 py-4 border border-divider">
                <div className="font-mono text-sm text-amber-700">
                  共{" "}
                  <span className="text-amber-500 font-display">
                    {data.total}
                  </span>{" "}
                  个 Upstreams，第{" "}
                  <span className="text-amber-500">{data.page}</span> /{" "}
                  <span className="text-amber-500">{data.total_pages}</span> 页
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page === data.total_pages}
                    className="gap-1"
                  >
                    下一页
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
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
