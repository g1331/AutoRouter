"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Topbar } from "@/components/admin/topbar";
import { UpstreamsTable } from "@/components/admin/upstreams-table";
import { UpstreamFormDialog } from "@/components/admin/upstream-form-dialog";
import { DeleteUpstreamDialog } from "@/components/admin/delete-upstream-dialog";
import { TestUpstreamDialog } from "@/components/admin/test-upstream-dialog";
import { UpstreamGroupDialog } from "@/components/admin/upstream-group-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Server,
  FolderKanban,
  AlertTriangle,
  Activity,
  AlertCircle,
  HelpCircle,
  Edit,
  Trash2,
} from "lucide-react";
import { useUpstreams, useTestUpstream } from "@/hooks/use-upstreams";
import { useUpstreamGroups, useDeleteUpstreamGroup } from "@/hooks/use-upstream-groups";
import type { Upstream, UpstreamGroup } from "@/types/api";

type TabType = "upstreams" | "groups";

/**
 * Cassette Futurism Upstreams Management Page
 *
 * Terminal-style upstream configuration with:
 * - Amber text on dark background
 * - Glowing borders and indicators
 * - Mono font for data display
 * - Tab-based navigation for Upstreams and Groups management
 */
export default function UpstreamsPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>("upstreams");

  // Upstreams state
  const [upstreamPage, setUpstreamPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editUpstream, setEditUpstream] = useState<Upstream | null>(null);
  const [deleteUpstream, setDeleteUpstream] = useState<Upstream | null>(null);
  const [testUpstream, setTestUpstream] = useState<Upstream | null>(null);

  // Groups state
  const [groupPage, setGroupPage] = useState(1);
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<UpstreamGroup | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<UpstreamGroup | null>(null);

  const pageSize = 10;
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");

  // Upstreams data
  const { data: upstreamsData, isLoading: isUpstreamsLoading } = useUpstreams(
    upstreamPage,
    pageSize
  );
  const {
    mutate: testUpstreamMutation,
    data: testResult,
    isPending: isTestLoading,
  } = useTestUpstream();

  // Groups data
  const { data: groupsData, isLoading: isGroupsLoading } = useUpstreamGroups(groupPage, pageSize);
  const deleteGroupMutation = useDeleteUpstreamGroup();

  // Trigger test when testUpstream changes
  useEffect(() => {
    if (testUpstream?.id) {
      testUpstreamMutation(testUpstream.id);
    }
  }, [testUpstream, testUpstreamMutation]);

  // Handle group delete
  const handleDeleteGroup = async () => {
    if (!deleteGroup) return;
    try {
      await deleteGroupMutation.mutateAsync(deleteGroup.id);
      setDeleteGroup(null);
    } catch {
      // Error already handled by mutation onError
    }
  };

  // Format strategy for display
  const formatStrategy = (strategy: string) => {
    switch (strategy) {
      case "round_robin":
        return t("strategyRoundRobin");
      case "weighted":
        return t("strategyWeighted");
      case "least_connections":
        return t("strategyLeastConnections");
      default:
        return strategy;
    }
  };

  return (
    <>
      <Topbar title={t("pageTitle")} />
      <div className="p-6 lg:p-8 space-y-6 bg-surface-100 min-h-screen">
        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-divider pb-4">
          <Button
            variant={activeTab === "upstreams" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("upstreams")}
            className="gap-2"
          >
            <Server className="h-4 w-4" aria-hidden="true" />
            {t("tabUpstreams")}
          </Button>
          <Button
            variant={activeTab === "groups" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("groups")}
            className="gap-2"
          >
            <FolderKanban className="h-4 w-4" aria-hidden="true" />
            {t("tabGroups")}
          </Button>
        </div>

        {/* Upstreams Tab Content */}
        {activeTab === "upstreams" && (
          <>
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
                  upstreams={upstreamsData?.items || []}
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
          </>
        )}

        {/* Groups Tab Content */}
        {activeTab === "groups" && (
          <>
            {/* Action Bar */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FolderKanban className="w-5 h-5 text-amber-500" aria-hidden="true" />
                  <h3 className="font-mono text-lg font-medium tracking-wide text-amber-500 cf-glow-text">
                    {t("groupManagement")}
                  </h3>
                </div>
                <p className="font-sans text-sm text-amber-700">{t("groupManagementDesc")}</p>
              </div>
              <Button
                onClick={() => setCreateGroupDialogOpen(true)}
                variant="primary"
                className="gap-2"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("addGroup")}
              </Button>
            </div>

            {/* Groups Table */}
            {isGroupsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-10 h-10 border-2 border-amber-700 border-t-amber-500 rounded-full animate-spin" />
                  <p className="font-mono text-sm text-amber-700">{tCommon("loading")}</p>
                </div>
              </div>
            ) : groupsData?.items && groupsData.items.length > 0 ? (
              <>
                <div className="bg-surface-200 rounded-cf-sm border border-divider overflow-hidden">
                  {/* Table Header */}
                  <div className="grid grid-cols-[1fr_120px_140px_100px_100px_120px] gap-4 px-6 py-3 bg-surface-300 border-b border-divider">
                    <div className="font-mono text-xs font-medium text-amber-500 uppercase tracking-wider">
                      {tCommon("name")}
                    </div>
                    <div className="font-mono text-xs font-medium text-amber-500 uppercase tracking-wider">
                      {t("tableProvider")}
                    </div>
                    <div className="font-mono text-xs font-medium text-amber-500 uppercase tracking-wider">
                      {t("strategy")}
                    </div>
                    <div className="font-mono text-xs font-medium text-amber-500 uppercase tracking-wider">
                      {t("upstreamCount")}
                    </div>
                    <div className="font-mono text-xs font-medium text-amber-500 uppercase tracking-wider">
                      {tCommon("status")}
                    </div>
                    <div className="font-mono text-xs font-medium text-amber-500 uppercase tracking-wider text-right">
                      {tCommon("actions")}
                    </div>
                  </div>

                  {/* Table Body */}
                  {groupsData.items.map((group) => (
                    <div
                      key={group.id}
                      className="grid grid-cols-[1fr_120px_140px_100px_100px_120px] gap-4 px-6 py-4 border-b border-divider last:border-b-0 hover:bg-surface-300/50 transition-colors"
                    >
                      {/* Name */}
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-sm text-amber-400 font-medium">
                          {group.name}
                        </span>
                        {group.healthy_count !== undefined &&
                          group.upstream_count !== undefined && (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-amber-700">
                                {group.healthy_count}/{group.upstream_count} {t("healthy")}
                              </span>
                            </div>
                          )}
                      </div>

                      {/* Provider */}
                      <div className="flex items-center">
                        <Badge variant="outline" className="font-mono text-xs">
                          {group.provider.toUpperCase()}
                        </Badge>
                      </div>

                      {/* Strategy */}
                      <div className="flex items-center">
                        <span className="font-mono text-sm text-amber-600">
                          {formatStrategy(group.strategy)}
                        </span>
                      </div>

                      {/* Upstream Count */}
                      <div className="flex items-center">
                        <span className="font-mono text-sm text-amber-500">
                          {group.upstream_count ?? 0}
                        </span>
                      </div>

                      {/* Status */}
                      <div className="flex items-center">
                        {group.is_active ? (
                          <Badge variant="success" className="gap-1">
                            <Activity className="h-3 w-3" />
                            {t("active")}
                          </Badge>
                        ) : (
                          <Badge variant="neutral" className="gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {t("inactive")}
                          </Badge>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditGroup(group)}
                          aria-label={tCommon("edit")}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteGroup(group)}
                          aria-label={tCommon("delete")}
                          className="text-status-error hover:text-status-error"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {groupsData.total_pages > 1 && (
                  <div className="flex items-center justify-between bg-surface-200 rounded-cf-sm px-6 py-4 border border-divider">
                    <div className="font-mono text-sm text-amber-700">
                      {tCommon("items")}{" "}
                      <span className="text-amber-500 font-display">{groupsData.total}</span> ,{" "}
                      {tCommon("page")} <span className="text-amber-500">{groupsData.page}</span>{" "}
                      {tCommon("of")}{" "}
                      <span className="text-amber-500">{groupsData.total_pages}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setGroupPage(groupPage - 1)}
                        disabled={groupPage === 1}
                        className="gap-1"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        {tCommon("previous")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setGroupPage(groupPage + 1)}
                        disabled={groupPage === groupsData.total_pages}
                        className="gap-1"
                      >
                        {tCommon("next")}
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 bg-surface-200 rounded-cf-sm border border-divider">
                <HelpCircle className="w-12 h-12 text-amber-700 mb-4" />
                <p className="font-mono text-lg text-amber-500 mb-2">{t("noGroups")}</p>
                <p className="font-sans text-sm text-amber-700">{t("noGroupsDesc")}</p>
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

      {/* Create Group Dialog */}
      <UpstreamGroupDialog open={createGroupDialogOpen} onOpenChange={setCreateGroupDialogOpen} />

      {/* Edit Group Dialog */}
      <UpstreamGroupDialog
        group={editGroup}
        open={!!editGroup}
        onOpenChange={(open) => !open && setEditGroup(null)}
      />

      {/* Delete Group Confirmation Dialog */}
      <Dialog open={!!deleteGroup} onOpenChange={(open) => !open && setDeleteGroup(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--shape-corner-medium)] bg-[rgb(var(--md-sys-color-error-container))] flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-[rgb(var(--md-sys-color-on-error-container))]" />
              </div>
              {t("deleteGroupTitle")}
            </DialogTitle>
            <DialogDescription>{t("deleteGroupDesc")}</DialogDescription>
          </DialogHeader>

          {deleteGroup && (
            <div className="space-y-3 py-4">
              <div className="bg-[rgb(var(--md-sys-color-error-container))] rounded-[var(--shape-corner-medium)] p-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="type-label-large text-[rgb(var(--md-sys-color-on-error-container))]">
                      {tCommon("name")}:
                    </span>
                    <span className="type-body-medium text-[rgb(var(--md-sys-color-on-error-container))]">
                      {deleteGroup.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="type-label-large text-[rgb(var(--md-sys-color-on-error-container))]">
                      {t("provider")}:
                    </span>
                    <span className="type-body-medium text-[rgb(var(--md-sys-color-on-error-container))]">
                      {deleteGroup.provider}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="type-label-large text-[rgb(var(--md-sys-color-on-error-container))]">
                      {t("strategy")}:
                    </span>
                    <span className="type-body-medium text-[rgb(var(--md-sys-color-on-error-container))]">
                      {formatStrategy(deleteGroup.strategy)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-[rgb(var(--md-sys-color-warning-container))] rounded-[var(--shape-corner-medium)] p-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-[rgb(var(--md-sys-color-on-warning-container))]" />
                <p className="type-body-small text-[rgb(var(--md-sys-color-on-warning-container))]">
                  {t("deleteGroupWarning")}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteGroup(null)}
              disabled={deleteGroupMutation.isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteGroup}
              disabled={deleteGroupMutation.isPending}
            >
              {deleteGroupMutation.isPending ? t("deleting") : tCommon("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
