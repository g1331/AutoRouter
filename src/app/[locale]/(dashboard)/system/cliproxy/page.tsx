"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Topbar } from "@/components/admin/topbar";
import { PageShell } from "@/components/admin/page-shell";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryStatus } from "@/components/ui/query-status";
import { CliproxySkeleton as Skeleton } from "@/components/admin/cliproxy-skeleton";
import { CliproxyInstancesTable } from "@/components/admin/cliproxy-instances-table";
import { CliproxyInstanceFormDialog } from "@/components/admin/cliproxy-instance-form-dialog";
import { DeleteCliproxyInstanceDialog } from "@/components/admin/delete-cliproxy-instance-dialog";
import { CliproxyConnectionTestDialog } from "@/components/admin/cliproxy-connection-test-dialog";
import { CliproxyAccountsPanel } from "@/components/admin/cliproxy-accounts-panel";
import { CliproxyAccountsSkeleton } from "@/components/admin/cliproxy-accounts-skeleton";
import { CliproxyPoolUpstreamDialog } from "@/components/admin/cliproxy-pool-upstream-dialog";
import { CliproxyLinkedUpstreamsPanel } from "@/components/admin/cliproxy-linked-upstreams-panel";
import { CliproxyInstanceLogsPanel } from "@/components/admin/cliproxy-instance-logs-panel";
import { useCliproxyInstances } from "@/hooks/use-cliproxy";
import { useContainerMorph } from "@/hooks/use-container-morph";
import { cn } from "@/lib/utils";
import type { CliproxyInstance } from "@/types/cliproxy";

type WorkspaceView = "accounts" | "upstreams" | "logs";
const VIEWS: WorkspaceView[] = ["accounts", "upstreams", "logs"];

function CliproxyInstanceSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 items-center gap-3 px-4 py-3">
      <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2 lg:flex lg:items-center lg:gap-4 lg:space-y-0">
        <Skeleton className="h-4 w-36 max-w-full" />
        <Skeleton className="h-3 w-44 max-w-full" />
      </div>
      <Skeleton className="hidden h-5 w-20 lg:block" />
      <Skeleton className="h-5 w-10 shrink-0 rounded-full" />
      <Skeleton className="h-8 w-8 shrink-0" />
    </div>
  );
}

function CliproxyWorkspaceSkeleton() {
  return (
    <div aria-hidden="true" className="min-w-0 space-y-5">
      <div className="flex gap-5 border-b border-divider pb-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-56 max-w-full" />
        </div>
        <div className="flex max-w-full flex-wrap gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-cf-sm bg-surface-300 px-3 py-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-64 max-w-full" />
          <Skeleton className="h-3 w-44 max-w-full" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <CliproxyAccountsSkeleton />
    </div>
  );
}

export default function CliproxyPage() {
  const t = useTranslations("cliproxy");
  const { data: instances, isLoading, isError, isFetching, refetch } = useCliproxyInstances();

  const [createOpen, setCreateOpen] = useState(false);
  const [editInstance, setEditInstance] = useState<CliproxyInstance | null>(null);
  const [deleteInstance, setDeleteInstance] = useState<CliproxyInstance | null>(null);
  const [testInstance, setTestInstance] = useState<CliproxyInstance | null>(null);
  const [poolUpstreamInstance, setPoolUpstreamInstance] = useState<CliproxyInstance | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [view, setView] = useState<WorkspaceView>("accounts");

  const { startMorph, canMorph } = useContainerMorph();
  const morphSourceRef = useRef<HTMLElement | null>(null);
  const selectedInstance =
    instances?.find((instance) => instance.id === selectedInstanceId) ?? instances?.[0] ?? null;
  const singleInstance = instances?.length === 1;

  const selectInstance = (instance: CliproxyInstance) => {
    setSelectedInstanceId(instance.id);
    setView("accounts");
  };

  const viewLabel: Record<WorkspaceView, string> = {
    accounts: t("accountsTitle"),
    upstreams: t("linkedUpstreamsTitle"),
    logs: t("logsTitle"),
  };

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <PageShell maxWidth="full" className="space-y-4 py-5 lg:space-y-5 lg:py-6">
        <PageHeader
          title={t("pageTitle")}
          description={t("pageDescription")}
          actions={
            <Button
              variant="outline"
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
          }
        />

        <div
          role={isLoading ? "status" : undefined}
          aria-label={isLoading ? t("workspaceLoading") : undefined}
          data-testid={isLoading ? "cliproxy-page-skeleton" : undefined}
          className={cn(
            "grid min-w-0 gap-4 xl:items-start",
            singleInstance || isLoading ? "xl:grid-cols-1" : "xl:grid-cols-[14rem_minmax(0,1fr)]"
          )}
        >
          <aside
            className={cn(
              "min-w-0 overflow-hidden rounded-cf-md border border-divider bg-card shadow-[var(--vr-shadow-xs)]",
              (singleInstance || isLoading) && "xl:col-span-full"
            )}
            aria-label={t("instancesTitle")}
          >
            <div
              className={cn(
                "space-y-3 border-b border-divider px-4 py-4",
                (singleInstance || isLoading) && "hidden"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-between gap-2",
                  singleInstance && "xl:sr-only"
                )}
              >
                <h2 className="type-title-medium text-foreground">{t("instancesTitle")}</h2>
                <span className="type-body-small tabular-nums text-muted-foreground">
                  {instances?.length ?? 0}
                </span>
              </div>
            </div>

            <div className="min-w-0">
              <QueryStatus
                error={isError}
                fetching={isFetching && !isLoading}
                hasData={instances !== undefined}
                onRetry={() => void refetch()}
              />
              {isLoading ? (
                <CliproxyInstanceSkeleton />
              ) : isError && !instances ? null : !instances || instances.length === 0 ? (
                <p className="px-4 py-8 type-body-small text-muted-foreground">
                  {t("noInstances")}
                </p>
              ) : (
                <CliproxyInstancesTable
                  instances={instances}
                  selectedInstanceId={selectedInstance?.id ?? null}
                  onSelect={selectInstance}
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
            </div>
          </aside>

          <section
            className="min-w-0 rounded-cf-md border border-divider bg-card px-4 py-5 shadow-[var(--vr-shadow-xs)] sm:px-6"
            aria-label={t("workspaceTitle")}
          >
            {selectedInstance ? (
              <div key={selectedInstance.id} className="min-w-0 space-y-5 content-enter">
                <header className={cn("space-y-2", singleInstance && "hidden")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="min-w-0 break-words text-xl font-semibold tracking-tight text-foreground">
                      {selectedInstance.name}
                    </h2>
                    <Badge variant={selectedInstance.enabled ? "success" : "secondary"}>
                      {selectedInstance.enabled ? t("statusEnabled") : t("statusDisabled")}
                    </Badge>
                  </div>
                  <p className="break-all type-body-small text-muted-foreground">
                    {selectedInstance.base_url}
                  </p>
                </header>

                <div
                  role="tablist"
                  aria-label={t("workspaceViews")}
                  className="flex gap-1 border-b border-divider"
                >
                  {VIEWS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      role="tab"
                      id={`cliproxy-tab-${item}`}
                      aria-controls={`cliproxy-panel-${item}`}
                      aria-selected={view === item}
                      tabIndex={view === item ? 0 : -1}
                      onClick={() => setView(item)}
                      onKeyDown={(event) => {
                        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                        event.preventDefault();
                        const direction = event.key === "ArrowRight" ? 1 : -1;
                        const next =
                          VIEWS[(VIEWS.indexOf(item) + direction + VIEWS.length) % VIEWS.length];
                        setView(next);
                        document.getElementById(`cliproxy-tab-${next}`)?.focus();
                      }}
                      className={cn(
                        "min-w-0 rounded-t-cf-sm border-b-2 px-3 py-2 type-body-small font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4",
                        view === item
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {viewLabel[item]}
                    </button>
                  ))}
                </div>

                <div
                  role="tabpanel"
                  id={`cliproxy-panel-${view}`}
                  aria-labelledby={`cliproxy-tab-${view}`}
                  className="min-w-0"
                >
                  {view === "accounts" ? (
                    <CliproxyAccountsPanel instance={selectedInstance} />
                  ) : null}
                  {view === "upstreams" ? (
                    <CliproxyLinkedUpstreamsPanel instance={selectedInstance} />
                  ) : null}
                  {view === "logs" ? (
                    <CliproxyInstanceLogsPanel instance={selectedInstance} />
                  ) : null}
                </div>
              </div>
            ) : isLoading ? (
              <CliproxyWorkspaceSkeleton />
            ) : (
              <div className="flex min-h-52 items-center justify-center text-center type-body-medium text-muted-foreground">
                {isError ? t("workspaceInstancesFailed") : t("workspaceNoInstance")}
              </div>
            )}
          </section>
        </div>
      </PageShell>

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
