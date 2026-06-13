"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Key, Plus } from "lucide-react";

import { Topbar } from "@/components/admin/topbar";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { PortalKeyDialog } from "@/components/portal/portal-key-dialog";
import { PortalKeysTable } from "@/components/portal/portal-keys-table";
import { PortalRevokeKeyDialog } from "@/components/portal/portal-revoke-key-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalKeys } from "@/hooks/use-portal-keys";
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

  const { data, isLoading } = usePortalKeys(page, pageSize);

  return (
    <>
      <Topbar title={t("keys.pageTitle")} />

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <span className="type-body-medium text-muted-foreground">
              {t("keys.managementDesc")}
            </span>
          </div>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {tKeys("createKey")}
          </Button>
        </div>

        {isLoading ? (
          <Card
            role="status"
            aria-label={tCommon("loading")}
            variant="outlined"
            className="space-y-3 border-divider bg-surface-200/70 p-4"
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
              onEdit={setEditingKey}
              onRevoke={setRevokeKey}
            />

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

      <PortalKeyDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} />

      <PortalKeyDialog
        mode="edit"
        apiKey={editingKey}
        open={!!editingKey}
        onOpenChange={(open) => !open && setEditingKey(null)}
      />

      <PortalRevokeKeyDialog
        apiKey={revokeKey}
        open={!!revokeKey}
        onClose={() => setRevokeKey(null)}
      />
    </>
  );
}
