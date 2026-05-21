"use client";

import { useState } from "react";
import { LogIn, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCliproxyAuthAccounts,
  useSetCliproxyAuthAccountStatus,
  useSyncCliproxyAuthAccounts,
} from "@/hooks/use-cliproxy";
import type { CliproxyAuthAccount, CliproxyInstance } from "@/types/cliproxy";
import { CliproxyAccountsTable } from "./cliproxy-accounts-table";
import { CliproxyAccountFieldsDialog } from "./cliproxy-account-fields-dialog";
import { CliproxyOAuthLoginDialog } from "./cliproxy-oauth-login-dialog";

interface CliproxyAccountsPanelProps {
  instance: CliproxyInstance;
}

/**
 * 选中实例后展示其 OAuth 账号列表的内联面板，提供同步、启停与字段编辑。
 */
export function CliproxyAccountsPanel({ instance }: CliproxyAccountsPanelProps) {
  const t = useTranslations("cliproxy");
  const { data: accounts, isLoading, isError } = useCliproxyAuthAccounts(instance.id);
  const syncMutation = useSyncCliproxyAuthAccounts();
  const statusMutation = useSetCliproxyAuthAccountStatus();

  const [editAccount, setEditAccount] = useState<CliproxyAuthAccount | null>(null);
  const [oauthOpen, setOauthOpen] = useState(false);

  const handleToggleStatus = (account: CliproxyAuthAccount) => {
    statusMutation.mutate({
      instanceId: instance.id,
      accountName: account.auth_file_name,
      disabled: !account.disabled,
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
            onEditFields={setEditAccount}
          />
        )}
      </CardContent>

      {editAccount && (
        <CliproxyAccountFieldsDialog
          instanceId={instance.id}
          account={editAccount}
          open
          onClose={() => setEditAccount(null)}
        />
      )}
      {oauthOpen && (
        <CliproxyOAuthLoginDialog
          instanceId={instance.id}
          open
          onClose={() => setOauthOpen(false)}
        />
      )}
    </Card>
  );
}
