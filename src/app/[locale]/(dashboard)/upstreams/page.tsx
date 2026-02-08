"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Topbar } from "@/components/admin/topbar";
import { UpstreamsTable } from "@/components/admin/upstreams-table";
import { UpstreamFormDialog } from "@/components/admin/upstream-form-dialog";
import { DeleteUpstreamDialog } from "@/components/admin/delete-upstream-dialog";
import { TestUpstreamDialog } from "@/components/admin/test-upstream-dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Server } from "lucide-react";
import { useUpstreams, useTestUpstream, useUpstreamHealth } from "@/hooks/use-upstreams";
import type { Upstream } from "@/types/api";

/**
 * Upstreams Management Page
 *
 * Terminal-style upstream configuration with:
 * - Amber text on dark background
 * - Glowing borders and indicators
 * - Mono font for data display
 * - Priority-based tiered routing display
 */
export default function UpstreamsPage() {
  // Upstreams state
  const [upstreamPage, setUpstreamPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editUpstream, setEditUpstream] = useState<Upstream | null>(null);
  const [deleteUpstream, setDeleteUpstream] = useState<Upstream | null>(null);
  const [testUpstream, setTestUpstream] = useState<Upstream | null>(null);

  const pageSize = 10;
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");

  // Upstreams data
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

  // Merge health data into upstreams
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

  // Trigger test when testUpstream changes
  useEffect(() => {
    if (testUpstream?.id) {
      testUpstreamMutation(testUpstream.id);
    }
  }, [testUpstream, testUpstreamMutation]);

  return (
    <>
      <Topbar title={t("pageTitle")} />
      <div className="p-6 lg:p-8 space-y-6 bg-surface-100 min-h-screen">
        {/* Action Bar */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Server className="w-5 h-5 text-amber-500" aria-hidden="true" />
              <h3 className="font-mono text-lg font-medium tracking-wide text-amber-500 cf-glow-text">
                {t("management")}
              </h3>
            </div>
            <p className="font-sans text-sm text-amber-700">{t("managementDesc")}</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} variant="primary" className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("addUpstream")}
          </Button>
        </div>

        {/* Table */}
        {isUpstreamsLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-2 border-amber-700 border-t-amber-500 rounded-full animate-spin" />
              <p className="font-mono text-sm text-amber-700">{tCommon("loading")}</p>
            </div>
          </div>
        ) : (
          <>
            <UpstreamsTable
              upstreams={upstreamsWithHealth}
              onEdit={setEditUpstream}
              onDelete={setDeleteUpstream}
              onTest={setTestUpstream}
            />

            {/* Pagination */}
            {upstreamsData && upstreamsData.total_pages > 1 && (
              <div className="flex items-center justify-between bg-surface-200 rounded-cf-sm px-6 py-4 border border-divider">
                <div className="font-mono text-sm text-amber-700">
                  {tCommon("items")}{" "}
                  <span className="text-amber-500 font-display">{upstreamsData.total}</span> ,{" "}
                  {tCommon("page")} <span className="text-amber-500">{upstreamsData.page}</span>{" "}
                  {tCommon("of")}{" "}
                  <span className="text-amber-500">{upstreamsData.total_pages}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUpstreamPage(upstreamPage - 1)}
                    disabled={upstreamPage === 1}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    {tCommon("previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUpstreamPage(upstreamPage + 1)}
                    disabled={upstreamPage === upstreamsData.total_pages}
                    className="gap-1"
                  >
                    {tCommon("next")}
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Upstream Dialog */}
      <UpstreamFormDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

      {/* Edit Upstream Dialog */}
      <UpstreamFormDialog
        upstream={editUpstream}
        open={!!editUpstream}
        onOpenChange={(open) => !open && setEditUpstream(null)}
      />

      {/* Delete Upstream Confirmation Dialog */}
      <DeleteUpstreamDialog
        upstream={deleteUpstream}
        open={!!deleteUpstream}
        onClose={() => setDeleteUpstream(null)}
      />

      {/* Test Upstream Dialog */}
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
