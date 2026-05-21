"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Topbar } from "@/components/admin/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CliproxyInstancesTable } from "@/components/admin/cliproxy-instances-table";
import { CliproxyInstanceFormDialog } from "@/components/admin/cliproxy-instance-form-dialog";
import { DeleteCliproxyInstanceDialog } from "@/components/admin/delete-cliproxy-instance-dialog";
import { CliproxyConnectionTestDialog } from "@/components/admin/cliproxy-connection-test-dialog";
import { useCliproxyInstances } from "@/hooks/use-cliproxy";
import type { CliproxyInstance } from "@/types/cliproxy";

export default function CliproxyPage() {
  const t = useTranslations("cliproxy");
  const { data: instances, isLoading, isError } = useCliproxyInstances();

  const [createOpen, setCreateOpen] = useState(false);
  const [editInstance, setEditInstance] = useState<CliproxyInstance | null>(null);
  const [deleteInstance, setDeleteInstance] = useState<CliproxyInstance | null>(null);
  const [testInstance, setTestInstance] = useState<CliproxyInstance | null>(null);

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden px-3 py-5 sm:px-6 lg:px-8 lg:py-7 xl:px-10">
        <Card variant="outlined">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="type-title-medium text-foreground">{t("instancesTitle")}</h2>
                <p className="type-body-small text-muted-foreground">{t("pageDescription")}</p>
              </div>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("addInstance")}
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : isError ? (
              <p className="py-8 text-center type-body-medium text-destructive">
                {t("loadFailed")}
              </p>
            ) : !instances || instances.length === 0 ? (
              <p className="py-8 text-center type-body-medium text-muted-foreground">
                {t("noInstances")}
              </p>
            ) : (
              <CliproxyInstancesTable
                instances={instances}
                onEdit={setEditInstance}
                onTest={setTestInstance}
                onDelete={setDeleteInstance}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {createOpen && (
        <CliproxyInstanceFormDialog open onOpenChange={(open) => !open && setCreateOpen(false)} />
      )}
      {editInstance && (
        <CliproxyInstanceFormDialog
          instance={editInstance}
          open
          onOpenChange={(open) => !open && setEditInstance(null)}
        />
      )}
      <DeleteCliproxyInstanceDialog
        instance={deleteInstance}
        open={Boolean(deleteInstance)}
        onClose={() => setDeleteInstance(null)}
      />
      {testInstance && (
        <CliproxyConnectionTestDialog
          instance={testInstance}
          open
          onClose={() => setTestInstance(null)}
        />
      )}
    </>
  );
}
