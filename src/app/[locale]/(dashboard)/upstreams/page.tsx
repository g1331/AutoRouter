"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Plus, Server } from "lucide-react";

import { DeleteUpstreamDialog } from "@/components/admin/delete-upstream-dialog";
import { TestUpstreamDialog } from "@/components/admin/test-upstream-dialog";
import { Topbar } from "@/components/admin/topbar";
import { UpstreamFormDialog } from "@/components/admin/upstream-form-dialog";
import { UpstreamsTable } from "@/components/admin/upstreams-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUpstreams, useTestUpstream, useUpstreamHealth } from "@/hooks/use-upstreams";
import type { Upstream } from "@/types/api";

interface UpstreamsLoadingSkeletonProps {
  loadingLabel: string;
}

function UpstreamsLoadingSkeleton({ loadingLabel }: UpstreamsLoadingSkeletonProps) {
  return (
    <Card variant="outlined" className="border-divider bg-card/90">
      <CardContent className="p-0">
        <div
          role="status"
          aria-label={loadingLabel}
          className="overflow-hidden rounded-cf-md border border-divider/85 bg-surface-200/50"
        >
          <div className="border-b border-divider bg-surface-300/70 px-4 py-2.5">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-400/70" />
              <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-400/70" />
              <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-400/70" />
              <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-400/70" />
              <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-400/70" />
              <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-400/70" />
            </div>
          </div>

          <div className="divide-y divide-divider/70">
            {Array.from({ length: 7 }).map((_, index) => (
              <div
                key={`upstreams-loading-row-${index}`}
                className="grid grid-cols-12 items-center gap-3 px-4 py-3"
              >
                <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-300/80" />
                <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-300/80" />
                <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-300/80" />
                <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-300/80" />
                <div className="col-span-2 h-3 animate-pulse rounded-cf-sm bg-surface-300/80" />
                <div className="col-span-2 h-8 animate-pulse rounded-cf-sm bg-surface-300/80" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function UpstreamsPage() {
  const [upstreamPage, setUpstreamPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editUpstream, setEditUpstream] = useState<Upstream | null>(null);
  const [deleteUpstream, setDeleteUpstream] = useState<Upstream | null>(null);
  const [testUpstream, setTestUpstream] = useState<Upstream | null>(null);

  const pageSize = 10;
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");

  const { data: upstreamsData, isLoading: isUpstreamsLoading } = useUpstreams(
    upstreamPage,
    pageSize
  );
  const { data: healthData } = useUpstreamHealth();
  const {
    mutate: testUpstreamMutation,
    data: testResult,
    isPending: isTestLoading,
  } = useTestUpstream();

  const upstreamsWithHealth = useMemo(() => {
    const items = upstreamsData?.items || [];
    if (!healthData?.data) return items;
    const healthMap = new Map(healthData.data.map((h) => [h.upstream_id, h]));

    return items.map((u) => {
      const h = healthMap.get(u.id);
      if (!h) return u;
      return {
        ...u,
        health_status: {
          upstream_id: h.upstream_id,
          upstream_name: h.upstream_name,
          is_healthy: h.is_healthy,
          last_check_at: h.last_check_at,
          last_success_at: h.last_success_at,
          failure_count: h.failure_count,
          latency_ms: h.latency_ms,
          error_message: h.error_message,
        },
      };
    });
  }, [upstreamsData, healthData]);

  useEffect(() => {
    if (testUpstream?.id) {
      testUpstreamMutation(testUpstream.id);
    }
  }, [testUpstream, testUpstreamMutation]);

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <div className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 xl:px-10">
        <Card variant="outlined" className="border-divider/80 bg-card/92">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-500">
                <Server className="h-4 w-4" aria-hidden="true" />
                <span className="type-label-medium">{t("management")}</span>
              </div>
              <p className="type-body-medium text-muted-foreground">{t("managementDesc")}</p>
            </div>

            <Button
              onClick={() => setCreateDialogOpen(true)}
              variant="primary"
              className="w-full gap-2 sm:w-auto"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("addUpstream")}
            </Button>
          </CardContent>
        </Card>

        {isUpstreamsLoading ? (
          <UpstreamsLoadingSkeleton loadingLabel={tCommon("loading")} />
        ) : (
          <>
            <UpstreamsTable
              upstreams={upstreamsWithHealth}
              onEdit={setEditUpstream}
              onDelete={setDeleteUpstream}
              onTest={setTestUpstream}
            />

            {upstreamsData && upstreamsData.total_pages > 1 && (
              <Card variant="filled" className="border border-divider bg-card/90">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="type-body-small text-muted-foreground">
                    {tCommon("items")}{" "}
                    <span className="font-semibold text-foreground">{upstreamsData.total}</span> ·{" "}
                    {tCommon("page")}{" "}
                    <span className="font-semibold text-foreground">{upstreamsData.page}</span>{" "}
                    {tCommon("of")}{" "}
                    <span className="font-semibold text-foreground">
                      {upstreamsData.total_pages}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setUpstreamPage(upstreamPage - 1)}
                      disabled={upstreamPage === 1}
                      className="gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      {tCommon("previous")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setUpstreamPage(upstreamPage + 1)}
                      disabled={upstreamPage === upstreamsData.total_pages}
                      className="gap-1"
                    >
                      {tCommon("next")}
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <UpstreamFormDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

      <UpstreamFormDialog
        upstream={editUpstream}
        open={!!editUpstream}
        onOpenChange={(open) => !open && setEditUpstream(null)}
      />

      <DeleteUpstreamDialog
        upstream={deleteUpstream}
        open={!!deleteUpstream}
        onClose={() => setDeleteUpstream(null)}
      />

      <TestUpstreamDialog
        upstream={testUpstream}
        open={!!testUpstream}
        onClose={() => setTestUpstream(null)}
        testResult={testResult || null}
        isLoading={isTestLoading}
      />
    </>
  );
}
