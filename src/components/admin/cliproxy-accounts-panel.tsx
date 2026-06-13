"use client";

import { useRef, useState } from "react";
import { LogIn, RefreshCw, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useContainerMorph } from "@/hooks/use-container-morph";
import {
  useCliproxyAuthAccounts,
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
  const { data: accounts, isLoading, isError } = useCliproxyAuthAccounts(instance.id);
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
    <Card variant="outlined">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="type-title-medium text-foreground">{t("accountsTitle")}</h2>
            <p className="type-body-small text-muted-foreground">{instance.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setOauthOpen(true)}>
              <LogIn className="mr-2 h-4 w-4" />
              {t("oauthLogin")}
            </Button>
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              {t("uploadAuthFile")}
            </Button>
            <Button
              variant="outline"
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate(instance.id)}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {syncMutation.isPending ? t("syncing") : t("syncAccounts")}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <p className="py-8 text-center type-body-medium text-destructive">
            {t("accountsLoadFailed")}
          </p>
        ) : !accounts || accounts.length === 0 ? (
          <p className="py-8 text-center type-body-medium text-muted-foreground">
            {t("noAccounts")}
          </p>
        ) : (
          <CliproxyAccountsTable
            accounts={accounts}
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
      </CardContent>

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
    </Card>
  );
}
