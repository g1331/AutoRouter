"use client";

import { useState } from "react";
import { Topbar } from "@/components/admin/topbar";
import { KeysTable } from "@/components/admin/keys-table";
import { CreateKeyDialog } from "@/components/admin/create-key-dialog";
import { RevokeKeyDialog } from "@/components/admin/revoke-key-dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAPIKeys } from "@/hooks/use-api-keys";
import type { APIKey } from "@/types/api";

/**
 * API Keys 管理页面
 */
export default function KeysPage() {
  const [page, setPage] = useState(1);
  const [revokeKey, setRevokeKey] = useState<APIKey | null>(null);
  const pageSize = 10;

  const { data, isLoading } = useAPIKeys(page, pageSize);

  return (
    <>
      <Topbar title="API Keys" />
      <div className="px-8 py-6 space-y-6 bg-[rgb(var(--md-sys-color-surface-container))] min-h-screen">
        {/* 操作栏 */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="type-title-large text-[rgb(var(--md-sys-color-on-surface))]">API Keys 管理</h3>
            <p className="type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))] mt-1">
              创建和管理用于客户端访问的 API Keys
            </p>
          </div>
          <CreateKeyDialog />
        </div>

        {/* 表格 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-[3px] border-[rgb(var(--md-sys-color-outline-variant))] border-t-[rgb(var(--md-sys-color-primary))] rounded-full animate-spin"></div>
              <p className="type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))]">加载中...</p>
            </div>
          </div>
        ) : (
          <>
            <KeysTable
              keys={data?.items || []}
              onRevoke={setRevokeKey}
            />

            {/* 分页 */}
            {data && data.total_pages > 1 && (
              <div className="flex items-center justify-between bg-[rgb(var(--md-sys-color-surface))] rounded-[var(--shape-corner-large)] px-6 py-4 border border-[rgb(var(--md-sys-color-outline-variant))]">
                <div className="type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))]">
                  共 {data.total} 个 API Keys，第 {data.page} / {data.total_pages} 页
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

      {/* 撤销确认对话框 */}
      <RevokeKeyDialog
        apiKey={revokeKey}
        open={!!revokeKey}
        onClose={() => setRevokeKey(null)}
      />
    </>
  );
}
