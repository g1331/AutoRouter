"use client";

import { useMemo, useRef, useState } from "react";
import { LogIn, RefreshCw, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { QueryStatus } from "@/components/ui/query-status";
import { Skeleton } from "@/components/ui/skeleton";
import { useContainerMorph } from "@/hooks/use-container-morph";
import {
  useCliproxyAuthAccounts,
  useCliproxyAccountUsage,
  useDownloadCliproxyAuthFile,
  useSetCliproxyAuthAccountStatus,
  useSyncCliproxyAuthAccounts,
} from "@/hooks/use-cliproxy";
import type { CliproxyAuthAccount, CliproxyInstance } from "@/types/cliproxy";
import { CliproxyAccountsTable } from "./cliproxy-accounts-table";
import { CliproxyAccountFieldsDialog } from "./cliproxy-account-fields-dialog";
import { CliproxyAccountModelsDialog } from "./cliproxy-account-models-dialog";
import { CliproxyAccountDetailDialog } from "./cliproxy-account-detail-dialog";
import { CliproxyOAuthLoginDialog } from "./cliproxy-oauth-login-dialog";
import { CliproxyAccountUpstreamDialog } from "./cliproxy-account-upstream-dialog";
import { CliproxyAuthFileUploadDialog } from "./cliproxy-auth-file-upload-dialog";
import { CliproxyDeleteAuthFileDialog } from "./cliproxy-delete-auth-file-dialog";

interface CliproxyAccountsPanelProps {
  instance: CliproxyInstance;
}

/**
 * 选中实例后展示其 OAuth 账号列表的内联面板，提供 OAuth 登录、上传文件、同步、
 * 账号启停、字段编辑、详情查看、模型列表查看、下载、删除、上游映射等完整操作。
 */
export function CliproxyAccountsPanel({ instance }: CliproxyAccountsPanelProps) {
  const t = useTranslations("cliproxy");
  const {
    data: accounts,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useCliproxyAuthAccounts(instance.id);
  const {
    data: usageSnapshot,
    isLoading: usageLoading,
    isError: usageError,
    isFetching: usageFetching,
    refetch: refetchUsage,
  } = useCliproxyAccountUsage(instance.id);
  const syncMutation = useSyncCliproxyAuthAccounts();
  const statusMutation = useSetCliproxyAuthAccountStatus();
  const downloadMutation = useDownloadCliproxyAuthFile();

  const [editAccount, setEditAccount] = useState<CliproxyAuthAccount | null>(null);
  const [detailAccount, setDetailAccount] = useState<CliproxyAuthAccount | null>(null);
  const [modelsAccount, setModelsAccount] = useState<CliproxyAuthAccount | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<CliproxyAuthAccount | null>(null);
  const [mapAccount, setMapAccount] = useState<CliproxyAuthAccount | null>(null);
  const [oauthOpen, setOauthOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  // 容器变形动画：查看详情 / 编辑字段 / 删除从账号行展开、关闭收回。
  // 三者互斥（同一时刻只开一个），共用单个 view-transition-name。
  const { startMorph, canMorph } = useContainerMorph();
  const morphSourceRef = useRef<HTMLElement | null>(null);
  const usageByName = useMemo(
    () => new Map(usageSnapshot?.accounts.map((usage) => [usage.auth_file_name, usage]) ?? []),
    [usageSnapshot]
  );
  const usageState = usageLoading
    ? "loading"
    : usageError
      ? usageSnapshot
        ? "stale"
        : "error"
      : "ready";

  const handleToggleStatus = (account: CliproxyAuthAccount) => {
    statusMutation.mutate({
      instanceId: instance.id,
      accountName: account.auth_file_name,
      disabled: !account.disabled,
    });
  };

  const handleDownload = (account: CliproxyAuthAccount) => {
    downloadMutation.mutate({
      instanceId: instance.id,
      authFileName: account.auth_file_name,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="type-title-medium text-foreground">{t("accountsWorkspaceTitle")}</h3>
          <p className="type-body-small text-muted-foreground">{t("usageScope")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setOauthOpen(true)}>
            <LogIn className="mr-2 h-4 w-4" />
            {t("oauthLogin")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={t("uploadAuthFile")}
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="mr-2 h-4 w-4" />
            <span className="sm:hidden">{t("uploadAuthFileShort")}</span>
            <span className="hidden sm:inline">{t("uploadAuthFile")}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={t("syncAccounts")}
            disabled={syncMutation.isPending}
            onClick={() => syncMutation.mutate(instance.id)}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {syncMutation.isPending ? (
              t("syncing")
            ) : (
              <>
                <span className="sm:hidden">{t("syncAccountsShort")}</span>
                <span className="hidden sm:inline">{t("syncAccounts")}</span>
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-cf-sm bg-surface-300 px-3 py-3">
        <div className="min-w-0 space-y-1">
          <p className="type-body-small text-foreground">{t("usageExplanation")}</p>
          <p className="type-body-small text-muted-foreground">
            {usageSnapshot
              ? `${t("usageFetchedAt")}: ${new Date(usageSnapshot.fetched_at).toLocaleString()}`
              : usageLoading
                ? t("usageLoading")
                : t("usageNotFetched")}
            {usageSnapshot?.observed_at
              ? ` · ${t("usageObservedAt")}: ${new Date(usageSnapshot.observed_at).toLocaleString()}`
              : null}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={usageFetching}
          onClick={() => void refetchUsage()}
        >
          <RefreshCw
            className={
              usageFetching
                ? "mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                : "mr-2 h-4 w-4"
            }
          />
          {t("refreshUsage")}
        </Button>
      </div>
      {usageError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 type-body-small text-destructive"
        >
          <span>{usageSnapshot ? t("usageRefreshFailedStale") : t("usageLoadFailed")}</span>
          <Button variant="outline" size="sm" onClick={() => void refetchUsage()}>
            {t("retryUsage")}
          </Button>
        </div>
      ) : null}

      <QueryStatus
        error={isError}
        fetching={isFetching && !isLoading}
        hasData={accounts !== undefined}
        onRetry={() => void refetch()}
      />
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError && !accounts ? null : !accounts || accounts.length === 0 ? (
        <p className="py-8 text-center type-body-medium text-muted-foreground">{t("noAccounts")}</p>
      ) : (
        <CliproxyAccountsTable
          accounts={accounts}
          usageByName={usageByName}
          usageState={usageState}
          onToggleStatus={handleToggleStatus}
          onEditFields={(account, source) => {
            morphSourceRef.current = source;
            startMorph(() => setEditAccount(account), {
              source,
              name: "morph-cliproxy-account",
              mode: "enter",
            });
          }}
          onMapUpstream={setMapAccount}
          onViewDetail={(account, source) => {
            morphSourceRef.current = source;
            startMorph(() => setDetailAccount(account), {
              source,
              name: "morph-cliproxy-account",
              mode: "enter",
            });
          }}
          onViewModels={setModelsAccount}
          onDownload={handleDownload}
          onDelete={(account, source) => {
            morphSourceRef.current = source;
            startMorph(() => setDeleteAccount(account), {
              source,
              name: "morph-cliproxy-account",
              mode: "enter",
            });
          }}
        />
      )}

      {editAccount && (
        <CliproxyAccountFieldsDialog
          instanceId={instance.id}
          account={editAccount}
          open
          onClose={() =>
            startMorph(() => setEditAccount(null), {
              source: morphSourceRef.current,
              name: "morph-cliproxy-account",
              mode: "exit",
            })
          }
          morph={canMorph}
          morphName="morph-cliproxy-account"
        />
      )}
      {detailAccount && (
        <CliproxyAccountDetailDialog
          account={detailAccount}
          usage={usageByName.get(detailAccount.auth_file_name) ?? null}
          usageState={usageState}
          open
          onClose={() =>
            startMorph(() => setDetailAccount(null), {
              source: morphSourceRef.current,
              name: "morph-cliproxy-account",
              mode: "exit",
            })
          }
          morph={canMorph}
          morphName="morph-cliproxy-account"
        />
      )}
      {modelsAccount && (
        <CliproxyAccountModelsDialog
          instanceId={instance.id}
          authFileName={modelsAccount.auth_file_name}
          open
          onClose={() => setModelsAccount(null)}
        />
      )}
      {oauthOpen && (
        <CliproxyOAuthLoginDialog
          instanceId={instance.id}
          open
          onClose={() => setOauthOpen(false)}
        />
      )}
      {uploadOpen && (
        <CliproxyAuthFileUploadDialog
          instanceId={instance.id}
          open
          onClose={() => setUploadOpen(false)}
        />
      )}
      {mapAccount && (
        <CliproxyAccountUpstreamDialog
          instanceId={instance.id}
          account={mapAccount}
          open
          onClose={() => setMapAccount(null)}
        />
      )}
      <CliproxyDeleteAuthFileDialog
        instanceId={instance.id}
        account={deleteAccount}
        onClose={() =>
          startMorph(() => setDeleteAccount(null), {
            source: morphSourceRef.current,
            name: "morph-cliproxy-account",
            mode: "exit",
          })
        }
        morph={canMorph}
        morphName="morph-cliproxy-account"
      />
    </div>
  );
}
