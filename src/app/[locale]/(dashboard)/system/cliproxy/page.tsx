"use client";

import { useRef, useState } from "react";
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
import { CliproxyAccountsPanel } from "@/components/admin/cliproxy-accounts-panel";
import { CliproxyPoolUpstreamDialog } from "@/components/admin/cliproxy-pool-upstream-dialog";
import { CliproxyLinkedUpstreamsPanel } from "@/components/admin/cliproxy-linked-upstreams-panel";
import { CliproxyInstanceLogsPanel } from "@/components/admin/cliproxy-instance-logs-panel";
import { useCliproxyInstances } from "@/hooks/use-cliproxy";
import { useContainerMorph } from "@/hooks/use-container-morph";
import type { CliproxyInstance } from "@/types/cliproxy";

export default function CliproxyPage() {
  const t = useTranslations("cliproxy");
  const { data: instances, isLoading, isError } = useCliproxyInstances();

  const [createOpen, setCreateOpen] = useState(false);
  const [editInstance, setEditInstance] = useState<CliproxyInstance | null>(null);
  const [deleteInstance, setDeleteInstance] = useState<CliproxyInstance | null>(null);
  const [testInstance, setTestInstance] = useState<CliproxyInstance | null>(null);
  const [poolUpstreamInstance, setPoolUpstreamInstance] = useState<CliproxyInstance | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  // 容器变形动画：新建按钮 / 实例行作为源，编辑与删除从同一实例展开、关闭收回。
  // 同一时刻只开一个实例弹窗，共用单个 view-transition-name。
  const { startMorph, canMorph } = useContainerMorph();
  const morphSourceRef = useRef<HTMLElement | null>(null);

  const selectedInstance =
    instances?.find((instance) => instance.id === selectedInstanceId) ?? null;

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
              <Button
                onClick={(event) => {
                  const source = event.currentTarget;
                  morphSourceRef.current = source;
                  startMorph(() => setCreateOpen(true), {
                    source,
                    name: "morph-cliproxy-instance",
                    mode: "enter",
                  });
                }}
              >
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
                selectedInstanceId={selectedInstanceId}
                onSelect={(instance) => setSelectedInstanceId(instance.id)}
                onEdit={(instance, source) => {
                  morphSourceRef.current = source;
                  startMorph(() => setEditInstance(instance), {
                    source,
                    name: "morph-cliproxy-instance",
                    mode: "enter",
                  });
                }}
                onTest={setTestInstance}
                onCreatePoolUpstream={setPoolUpstreamInstance}
                onDelete={(instance, source) => {
                  morphSourceRef.current = source;
                  startMorph(() => setDeleteInstance(instance), {
                    source,
                    name: "morph-cliproxy-instance",
                    mode: "enter",
                  });
                }}
              />
            )}
          </CardContent>
        </Card>

        {selectedInstance ? (
          <>
            <CliproxyAccountsPanel instance={selectedInstance} />
            <CliproxyLinkedUpstreamsPanel instance={selectedInstance} />
            <CliproxyInstanceLogsPanel instance={selectedInstance} />
          </>
        ) : instances && instances.length > 0 ? (
          <Card variant="outlined">
            <CardContent className="p-6">
              <p className="text-center type-body-medium text-muted-foreground">
                {t("selectInstanceHint")}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {createOpen && (
        <CliproxyInstanceFormDialog
          open
          onOpenChange={(open) =>
            !open &&
            startMorph(() => setCreateOpen(false), {
              source: morphSourceRef.current,
              name: "morph-cliproxy-instance",
              mode: "exit",
            })
          }
          morph={canMorph}
          morphName="morph-cliproxy-instance"
        />
      )}
      {editInstance && (
        <CliproxyInstanceFormDialog
          instance={editInstance}
          open
          onOpenChange={(open) =>
            !open &&
            startMorph(() => setEditInstance(null), {
              source: morphSourceRef.current,
              name: "morph-cliproxy-instance",
              mode: "exit",
            })
          }
          morph={canMorph}
          morphName="morph-cliproxy-instance"
        />
      )}
      <DeleteCliproxyInstanceDialog
        instance={deleteInstance}
        open={Boolean(deleteInstance)}
        onClose={() =>
          startMorph(() => setDeleteInstance(null), {
            source: morphSourceRef.current,
            name: "morph-cliproxy-instance",
            mode: "exit",
          })
        }
        morph={canMorph}
        morphName="morph-cliproxy-instance"
      />
      {testInstance && (
        <CliproxyConnectionTestDialog
          instance={testInstance}
          open
          onClose={() => setTestInstance(null)}
        />
      )}
      {poolUpstreamInstance && (
        <CliproxyPoolUpstreamDialog
          instanceId={poolUpstreamInstance.id}
          open
          onClose={() => setPoolUpstreamInstance(null)}
        />
      )}
    </>
  );
}
