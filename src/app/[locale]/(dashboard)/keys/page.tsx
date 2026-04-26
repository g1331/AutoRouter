"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Key } from "lucide-react";

import { CreateKeyDialog } from "@/components/admin/create-key-dialog";
import { EditKeyDialog } from "@/components/admin/edit-key-dialog";
import { KeysTable } from "@/components/admin/keys-table";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { RevokeKeyDialog } from "@/components/admin/revoke-key-dialog";
import { Topbar } from "@/components/admin/topbar";
import { Card } from "@/components/ui/card";
import { useAPIKeys } from "@/hooks/use-api-keys";
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
  const [revokeKey, setRevokeKey] = useState<APIKey | null>(null);
  const [editingKey, setEditingKey] = useState<APIKey | null>(null);
  const pageSize = 10;

  const t = useTranslations("keys");
  const tCommon = useTranslations("common");
  const { data, isLoading } = useAPIKeys(page, pageSize);

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <span className="type-body-medium text-muted-foreground">{t("managementDesc")}</span>
          </div>
          <CreateKeyDialog />
        </div>

        {isLoading ? (
          <KeysLoadingSkeleton loadingLabel={tCommon("loading")} />
        ) : (
          <>
            <KeysTable keys={data?.items || []} onRevoke={setRevokeKey} onEdit={setEditingKey} />

            {data && data.total_pages > 1 && (
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
          </>
        )}
      </div>

      <RevokeKeyDialog apiKey={revokeKey} open={!!revokeKey} onClose={() => setRevokeKey(null)} />

      {editingKey && (
        <EditKeyDialog
          apiKey={editingKey}
          open={!!editingKey}
          onOpenChange={(open) => !open && setEditingKey(null)}
        />
      )}
    </>
  );
}
