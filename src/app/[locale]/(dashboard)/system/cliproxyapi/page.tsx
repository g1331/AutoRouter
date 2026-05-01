"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Cable, ExternalLink, KeyRound, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

import { Topbar } from "@/components/admin/topbar";
import { UpstreamFormDialog } from "@/components/admin/upstream-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  useCliproxyApiAccounts,
  useBuildCliproxyApiAccountPreset,
  useCliproxyApiAccountModels,
  useCliproxyApiConfig,
  useCliproxyApiStatus,
  useSaveCliproxyApiConfig,
  useStartCliproxyApiOauth,
  useTestCliproxyApiConnection,
  useUpdateCliproxyApiAccount,
} from "@/hooks/use-cliproxyapi";
import type {
  CliproxyApiAccount,
  CliproxyApiConnectionConfig,
  CliproxyApiConnectionMode,
  CliproxyApiEndpointKind,
  CliproxyApiProvider,
  CliproxyApiUpstreamPreset,
  UpstreamModelRule,
} from "@/types/api";
import { cn } from "@/lib/utils";

const PROVIDERS: CliproxyApiProvider[] = ["codex", "claude", "gemini"];
const TEST_ENDPOINTS: CliproxyApiEndpointKind[] = ["proxy", "management", "outbound_proxy"];

interface ConnectionDraft {
  id: string;
  name: string;
  mode: CliproxyApiConnectionMode;
  baseUrl: string;
  clientApiKey: string;
  managementUrl: string;
  managementSecret: string;
  outboundProxyUrl: string;
  isEnabled: boolean;
  isDefault: boolean;
}

function emptyDraft(): ConnectionDraft {
  return {
    id: "",
    name: "CLIProxyAPI Local",
    mode: "external",
    baseUrl: "http://localhost:8317/v1",
    clientApiKey: "",
    managementUrl: "http://localhost:8317/v0/management",
    managementSecret: "",
    outboundProxyUrl: "",
    isEnabled: true,
    isDefault: true,
  };
}

function draftFromConnection(connection: CliproxyApiConnectionConfig | null): ConnectionDraft {
  if (!connection) {
    return emptyDraft();
  }

  return {
    id: connection.id,
    name: connection.name,
    mode: connection.mode,
    baseUrl: connection.base_url,
    clientApiKey: "",
    managementUrl: connection.management_url,
    managementSecret: "",
    outboundProxyUrl: connection.outbound_proxy_url ?? "",
    isEnabled: connection.is_enabled,
    isDefault: connection.is_default,
  };
}

export default function CliproxyApiPage() {
  const t = useTranslations("cliproxyapi");
  const { data: configData, isLoading: isConfigLoading } = useCliproxyApiConfig();
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [draftEdits, setDraftEdits] = useState<Partial<ConnectionDraft>>({});
  const [accountForPreset, setAccountForPreset] = useState<CliproxyApiAccount | null>(null);
  const [initialUpstreamPreset, setInitialUpstreamPreset] = useState<
    (CliproxyApiUpstreamPreset & { model_rules?: UpstreamModelRule[] }) | null
  >(null);
  const [upstreamDialogOpen, setUpstreamDialogOpen] = useState(false);
  const [lastOauthResult, setLastOauthResult] = useState<{
    provider: CliproxyApiProvider;
    status: string;
    authUrl: string | null;
    deviceCode: string | null;
    expiresAt: string | null;
    message: string | null;
  } | null>(null);

  const saveConfig = useSaveCliproxyApiConfig();
  const testConnection = useTestCliproxyApiConnection();
  const startOauth = useStartCliproxyApiOauth();
  const updateAccount = useUpdateCliproxyApiAccount();
  const buildAccountPreset = useBuildCliproxyApiAccountPreset();

  const connections = useMemo(() => configData?.items ?? [], [configData?.items]);
  const defaultConnectionId = configData?.default_connection?.id ?? connections[0]?.id ?? "";
  const effectiveConnectionId = selectedConnectionId || defaultConnectionId;
  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.id === effectiveConnectionId) ?? null,
    [connections, effectiveConnectionId]
  );
  const baseDraft = useMemo(() => draftFromConnection(selectedConnection), [selectedConnection]);
  const draft = useMemo(() => ({ ...baseDraft, ...draftEdits }), [baseDraft, draftEdits]);

  const { data: statusData } = useCliproxyApiStatus(effectiveConnectionId, {
    enabled: Boolean(effectiveConnectionId),
  });
  const {
    data: accountsData,
    isLoading: isAccountsLoading,
    refetch: refetchAccounts,
  } = useCliproxyApiAccounts(effectiveConnectionId, { enabled: Boolean(effectiveConnectionId) });
  const { data: accountModelsData, isFetching: isAccountModelsFetching } =
    useCliproxyApiAccountModels(effectiveConnectionId, accountForPreset?.name ?? null, {
      enabled: Boolean(effectiveConnectionId && accountForPreset),
    });

  useEffect(() => {
    if (!accountForPreset || !accountModelsData) {
      return;
    }

    const models = accountModelsData.items.map((item) => item.model);
    buildAccountPreset
      .mutateAsync({
        connection_id: effectiveConnectionId,
        provider: accountForPreset.provider,
        account_name: accountForPreset.name,
        account_prefix: accountForPreset.prefix,
        models,
      })
      .then((preset) => {
        // The upstream dialog owns validation and final save; this page only prepares CPA-derived defaults.
        setInitialUpstreamPreset(preset);
        setUpstreamDialogOpen(true);
      })
      .finally(() => setAccountForPreset(null));
  }, [accountForPreset, accountModelsData, buildAccountPreset, effectiveConnectionId]);

  const status = statusData?.connection ?? selectedConnection;
  const accounts = accountsData?.items ?? [];

  const updateDraft = <K extends keyof ConnectionDraft>(key: K, value: ConnectionDraft[K]) => {
    setDraftEdits((current) => ({ ...current, [key]: value }));
  };

  const saveDraft = () => {
    saveConfig.mutate({
      id: draft.id || undefined,
      name: draft.name,
      mode: draft.mode,
      base_url: draft.baseUrl,
      client_api_key: draft.clientApiKey.trim() ? draft.clientApiKey : undefined,
      management_url: draft.managementUrl,
      management_secret: draft.managementSecret.trim() ? draft.managementSecret : undefined,
      outbound_proxy_url: draft.outboundProxyUrl.trim() || null,
      is_enabled: draft.isEnabled,
      is_default: draft.isDefault,
    });
  };

  const testEndpoint = (endpoint: CliproxyApiEndpointKind) => {
    testConnection.mutate({ connection_id: effectiveConnectionId, endpoint });
  };

  const startProviderOauth = async (provider: CliproxyApiProvider) => {
    const response = await startOauth.mutateAsync({
      connection_id: effectiveConnectionId,
      provider,
    });
    setLastOauthResult({
      provider: response.provider,
      status: response.status,
      authUrl: response.auth_url,
      deviceCode: response.device_code,
      expiresAt: response.expires_at,
      message: response.message,
    });
    // CPA returns a provider URL; opening a new tab keeps AutoRouter's management state intact.
    if (response.auth_url) {
      window.open(response.auth_url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden px-3 py-5 sm:px-6 lg:px-8 lg:py-7 xl:px-10">
        <Card
          variant="outlined"
          className="border-surface-400/65 bg-surface-300/38 shadow-[var(--vr-shadow-sm)]"
        >
          <CardContent className="space-y-4 p-4 sm:p-5 lg:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-amber-500">
                  <Cable className="h-4 w-4" aria-hidden="true" />
                  <span className="type-label-medium">{t("title")}</span>
                </div>
                <p className="type-body-medium text-muted-foreground">{t("description")}</p>
              </div>

              {connections.length > 0 && (
                <Select
                  value={effectiveConnectionId}
                  onValueChange={(connectionId) => {
                    setSelectedConnectionId(connectionId);
                    setDraftEdits({});
                  }}
                >
                  <SelectTrigger className="w-full border-surface-400/70 bg-surface-200/70 lg:w-72">
                    <SelectValue placeholder={t("connectionSelect")} />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((connection) => (
                      <SelectItem key={connection.id} value={connection.id}>
                        {connection.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <Card
            variant="outlined"
            className="border-surface-400/65 bg-card shadow-[var(--vr-shadow-sm)]"
          >
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="type-title-small">{t("connectionTitle")}</h2>
                  <p className="type-body-small text-muted-foreground">{t("connectionDesc")}</p>
                </div>
                <Badge variant={status?.last_status === "success" ? "success" : "neutral"}>
                  {status?.last_status ?? (isConfigLoading ? t("loading") : t("untested"))}
                </Badge>
              </div>

              <div className="grid gap-3">
                <Label htmlFor="cpa-name">{t("name")}</Label>
                <Input
                  id="cpa-name"
                  value={draft.name}
                  onChange={(event) => updateDraft("name", event.target.value)}
                />

                <Label htmlFor="cpa-base-url">{t("baseUrl")}</Label>
                <Input
                  id="cpa-base-url"
                  value={draft.baseUrl}
                  onChange={(event) => updateDraft("baseUrl", event.target.value)}
                />

                <Label htmlFor="cpa-client-key">{t("clientApiKey")}</Label>
                <Input
                  id="cpa-client-key"
                  type="password"
                  value={draft.clientApiKey}
                  placeholder={selectedConnection?.client_api_key_masked ?? t("secretUnchanged")}
                  onChange={(event) => updateDraft("clientApiKey", event.target.value)}
                />

                <Label htmlFor="cpa-management-url">{t("managementUrl")}</Label>
                <Input
                  id="cpa-management-url"
                  value={draft.managementUrl}
                  onChange={(event) => updateDraft("managementUrl", event.target.value)}
                />

                <Label htmlFor="cpa-management-secret">{t("managementSecret")}</Label>
                <Input
                  id="cpa-management-secret"
                  type="password"
                  value={draft.managementSecret}
                  placeholder={selectedConnection?.management_secret_masked ?? t("secretUnchanged")}
                  onChange={(event) => updateDraft("managementSecret", event.target.value)}
                />

                <Label htmlFor="cpa-outbound-proxy">{t("outboundProxyUrl")}</Label>
                <Input
                  id="cpa-outbound-proxy"
                  value={draft.outboundProxyUrl}
                  placeholder="http://127.0.0.1:7890"
                  onChange={(event) => updateDraft("outboundProxyUrl", event.target.value)}
                />

                <div className="flex flex-wrap items-center gap-4 rounded-cf-sm border border-divider/70 bg-surface-200/55 px-3 py-2 text-sm">
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={draft.isEnabled}
                      onCheckedChange={(checked) => updateDraft("isEnabled", checked)}
                    />
                    {t("enabled")}
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={draft.isDefault}
                      onCheckedChange={(checked) => updateDraft("isDefault", checked)}
                    />
                    {t("defaultConnection")}
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={saveDraft} disabled={saveConfig.isPending} className="gap-2">
                  {saveConfig.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  {t("saveConnection")}
                </Button>
                {TEST_ENDPOINTS.map((endpoint) => (
                  <Button
                    key={endpoint}
                    type="button"
                    variant="outline"
                    onClick={() => testEndpoint(endpoint)}
                    disabled={!effectiveConnectionId || testConnection.isPending}
                  >
                    {t(`testEndpoint.${endpoint}`)}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card
              variant="outlined"
              className="border-surface-400/65 bg-card shadow-[var(--vr-shadow-sm)]"
            >
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="type-title-small">{t("oauthTitle")}</h2>
                    <p className="type-body-small text-muted-foreground">{t("oauthDesc")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PROVIDERS.map((provider) => (
                      <Button
                        key={provider}
                        type="button"
                        variant="outline"
                        className="gap-2"
                        disabled={!effectiveConnectionId || startOauth.isPending}
                        onClick={() => startProviderOauth(provider)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        {t(`provider.${provider}`)}
                      </Button>
                    ))}
                  </div>
                </div>
                {lastOauthResult && (
                  <div className="rounded-cf-sm border border-divider/70 bg-surface-200/55 px-3 py-2 text-sm">
                    <p className="font-medium">
                      {t("oauthResult", {
                        provider: t(`provider.${lastOauthResult.provider}`),
                        status: lastOauthResult.status,
                      })}
                    </p>
                    {lastOauthResult.authUrl && (
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {lastOauthResult.authUrl}
                      </p>
                    )}
                    {lastOauthResult.deviceCode && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("deviceCode", { code: lastOauthResult.deviceCode })}
                      </p>
                    )}
                    {lastOauthResult.expiresAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("expiresAt", { time: lastOauthResult.expiresAt })}
                      </p>
                    )}
                    {lastOauthResult.message && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {lastOauthResult.message}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card
              variant="outlined"
              className="border-surface-400/65 bg-card shadow-[var(--vr-shadow-sm)]"
            >
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="type-title-small">{t("accountsTitle")}</h2>
                    <p className="type-body-small text-muted-foreground">{t("accountsDesc")}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchAccounts()}
                    disabled={!effectiveConnectionId || isAccountsLoading}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("refreshHint")}
                  </Button>
                </div>

                {isAccountsLoading ? (
                  <p className="rounded-cf-sm border border-divider/70 bg-surface-200/55 px-3 py-2 text-sm text-muted-foreground">
                    {t("loading")}
                  </p>
                ) : accounts.length === 0 ? (
                  <p className="rounded-cf-sm border border-divider/70 bg-surface-200/55 px-3 py-2 text-sm text-muted-foreground">
                    {t("accountsEmpty")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {accounts.map((account) => (
                      <div
                        key={account.id}
                        className="rounded-cf-sm border border-divider/70 bg-surface-200/55 px-3 py-3"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <KeyRound className="h-4 w-4 text-amber-500" aria-hidden="true" />
                              <span className="truncate text-sm font-medium">{account.name}</span>
                              <Badge variant={account.enabled ? "success" : "neutral"}>
                                {account.enabled ? t("enabled") : t("disabled")}
                              </Badge>
                              <Badge variant="neutral">{t(`provider.${account.provider}`)}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {t("accountMeta", {
                                prefix: account.prefix ?? "-",
                                count: account.model_count,
                                status: account.status,
                              })}
                            </p>
                            {account.error && (
                              <p className="text-xs text-status-error">{account.error}</p>
                            )}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn("gap-2", account.enabled && "border-status-warning/50")}
                            disabled={updateAccount.isPending}
                            onClick={() =>
                              updateAccount.mutate({
                                connection_id: effectiveConnectionId,
                                name: account.name,
                                disabled: account.enabled,
                              })
                            }
                          >
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            {account.enabled ? t("disableAccount") : t("enableAccount")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={isAccountModelsFetching || buildAccountPreset.isPending}
                            onClick={() => setAccountForPreset(account)}
                          >
                            {t("createAccountUpstream")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <UpstreamFormDialog
        open={upstreamDialogOpen}
        initialCliproxyApiPreset={initialUpstreamPreset}
        onOpenChange={(open) => {
          setUpstreamDialogOpen(open);
          if (!open) {
            setInitialUpstreamPreset(null);
          }
        }}
      />
    </>
  );
}
