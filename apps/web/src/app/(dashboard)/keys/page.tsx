"use client";

import { useState } from "react";
import { Topbar } from "@/components/admin/topbar";
import { KeysTable } from "@/components/admin/keys-table";
import { CreateKeyDialog } from "@/components/admin/create-key-dialog";
import { RevokeKeyDialog } from "@/components/admin/revoke-key-dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Key } from "lucide-react";
import { useAPIKeys } from "@/hooks/use-api-keys";
import type { APIKey } from "@/types/api";

/**
 * Cassette Futurism API Keys 管理页面
 *
 * Terminal-style key management with:
 * - Amber text on dark background
 * - Glowing borders and indicators
 * - Mono font for data display
 */
export default function KeysPage() {
  const [page, setPage] = useState(1);
  const [revokeKey, setRevokeKey] = useState<APIKey | null>(null);
  const pageSize = 10;

  const { data, isLoading } = useAPIKeys(page, pageSize);

  return (
    <>
      <Topbar title="API Keys" />
      <div className="p-6 lg:p-8 space-y-6 bg-surface-100 min-h-screen">
        {/* 操作栏 */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Key className="w-5 h-5 text-amber-500" aria-hidden="true" />
              <h3 className="font-mono text-lg font-medium tracking-wide text-amber-500 cf-glow-text">
                API KEYS 管理
              </h3>
            </div>
            <p className="font-sans text-sm text-amber-700">
              创建和管理用于客户端访问的 API Keys
            </p>
          </div>
          <CreateKeyDialog />
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
            <KeysTable keys={data?.items || []} onRevoke={setRevokeKey} />

            {/* 分页 */}
            {data && data.total_pages > 1 && (
              <div className="flex items-center justify-between bg-surface-200 rounded-cf-sm px-6 py-4 border border-divider">
                <div className="font-mono text-sm text-amber-700">
                  共{" "}
                  <span className="text-amber-500 font-display">
                    {data.total}
                  </span>{" "}
                  个 API Keys，第{" "}
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

      {/* 撤销确认对话框 */}
      <RevokeKeyDialog
        apiKey={revokeKey}
        open={!!revokeKey}
        onClose={() => setRevokeKey(null)}
      />
    </>
  );
}
