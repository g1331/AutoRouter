import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import type {
  CliproxyInstance,
  CliproxyInstanceCreate,
  CliproxyInstanceUpdate,
  CliproxyConnectionTestResult,
  CliproxyAuthAccount,
  CliproxyAuthAccountFieldsUpdate,
  CliproxyAuthAccountSyncResult,
  CliproxyProvider,
  CliproxyUpstreamProvider,
  CliproxyOAuthInitiateResult,
  CliproxyOAuthStatusResult,
  CliproxyLogEntry,
  CliproxyAuthFileModel,
  CliproxyLinkedUpstream,
} from "@/types/cliproxy";

/** OAuth 登录状态轮询间隔（毫秒）。 */
export const CLIPROXY_OAUTH_POLL_INTERVAL_MS = 3000;

/** OAuth 登录的客户端轮询超时上限（毫秒）。 */
export const CLIPROXY_OAUTH_POLL_TIMEOUT_MS = 5 * 60 * 1000;

type CliproxyTranslator = (key: string, values?: Record<string, string | number | null>) => string;

/** 实例查询的根查询键。 */
const INSTANCES_KEY = ["cliproxy", "instances"] as const;

/** 列出全部 CLIProxyAPI 实例。 */
export function useCliproxyInstances() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: INSTANCES_KEY,
    queryFn: async () => {
      const response = await apiClient.get<{ data: CliproxyInstance[] }>(
        "/admin/cliproxy/instances"
      );
      return response.data;
    },
  });
}

/** 创建 CLIProxyAPI 实例。 */
export function useCreateCliproxyInstance() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("cliproxy") as CliproxyTranslator;

  return useMutation({
    mutationFn: async (data: CliproxyInstanceCreate) => {
      const response = await apiClient.post<{ data: CliproxyInstance }>(
        "/admin/cliproxy/instances",
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliproxy", "instances"] });
      toast.success(t("instanceCreateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(t("instanceCreateFailed", { message: error.message }));
    },
  });
}

/** 更新 CLIProxyAPI 实例。 */
export function useUpdateCliproxyInstance() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("cliproxy") as CliproxyTranslator;

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CliproxyInstanceUpdate }) => {
      const response = await apiClient.patch<{ data: CliproxyInstance }>(
        `/admin/cliproxy/instances/${id}`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliproxy", "instances"] });
      toast.success(t("instanceUpdateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(t("instanceUpdateFailed", { message: error.message }));
    },
  });
}

/** 删除 CLIProxyAPI 实例。 */
export function useDeleteCliproxyInstance() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("cliproxy") as CliproxyTranslator;

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<{ data: { id: string } }>(`/admin/cliproxy/instances/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliproxy", "instances"] });
      toast.success(t("instanceDeleteSuccess"));
    },
    onError: (error: Error) => {
      toast.error(t("instanceDeleteFailed", { message: error.message }));
    },
  });
}

/** 对未保存配置执行创建前连通性预检测。 */
export function useTestCliproxyConnection() {
  const { apiClient } = useAuth();

  return useMutation({
    mutationFn: async (input: { management_url: string; management_key: string }) => {
      const response = await apiClient.post<{ data: CliproxyConnectionTestResult }>(
        "/admin/cliproxy/instances/test",
        input
      );
      return response.data;
    },
  });
}

/** 对已保存实例执行连通性检测。 */
export function useTestCliproxyInstance() {
  const { apiClient } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post<{ data: CliproxyConnectionTestResult }>(
        `/admin/cliproxy/instances/${id}/test`
      );
      return response.data;
    },
  });
}

/** 列出指定实例下缓存的 OAuth 账号。 */
export function useCliproxyAuthAccounts(instanceId: string | null) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["cliproxy", "accounts", instanceId],
    queryFn: async () => {
      const response = await apiClient.get<{ data: CliproxyAuthAccount[] }>(
        `/admin/cliproxy/instances/${instanceId}/auth-accounts`
      );
      return response.data;
    },
    enabled: Boolean(instanceId),
  });
}

/** 从 CLIProxyAPI 同步指定实例的 OAuth 账号。 */
export function useSyncCliproxyAuthAccounts() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("cliproxy") as CliproxyTranslator;

  return useMutation({
    mutationFn: async (instanceId: string) => {
      const response = await apiClient.post<{ data: CliproxyAuthAccountSyncResult }>(
        `/admin/cliproxy/instances/${instanceId}/auth-accounts/sync`
      );
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["cliproxy", "accounts"] });
      toast.success(
        t("accountSyncSuccess", {
          added: result.added,
          updated: result.updated,
          removed: result.removed,
        })
      );
    },
    onError: (error: Error) => {
      toast.error(t("accountSyncFailed", { message: error.message }));
    },
  });
}

/** 启停指定 OAuth 账号。 */
export function useSetCliproxyAuthAccountStatus() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("cliproxy") as CliproxyTranslator;

  return useMutation({
    mutationFn: async ({
      instanceId,
      accountName,
      disabled,
    }: {
      instanceId: string;
      accountName: string;
      disabled: boolean;
    }) => {
      const response = await apiClient.patch<{ data: CliproxyAuthAccount }>(
        `/admin/cliproxy/instances/${instanceId}/auth-accounts/${encodeURIComponent(
          accountName
        )}/status`,
        { disabled }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliproxy", "accounts"] });
      toast.success(t("accountStatusUpdateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(t("accountStatusUpdateFailed", { message: error.message }));
    },
  });
}

/** 更新指定 OAuth 账号的前缀、出站代理、优先级与备注。 */
export function useUpdateCliproxyAuthAccountFields() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("cliproxy") as CliproxyTranslator;

  return useMutation({
    mutationFn: async ({
      instanceId,
      accountName,
      data,
    }: {
      instanceId: string;
      accountName: string;
      data: CliproxyAuthAccountFieldsUpdate;
    }) => {
      const response = await apiClient.patch<{ data: CliproxyAuthAccount }>(
        `/admin/cliproxy/instances/${instanceId}/auth-accounts/${encodeURIComponent(accountName)}`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliproxy", "accounts"] });
      toast.success(t("accountFieldsUpdateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(t("accountFieldsUpdateFailed", { message: error.message }));
    },
  });
}

/** 发起指定实例的 OAuth 登录。 */
export function useInitiateCliproxyOAuthLogin() {
  const { apiClient } = useAuth();

  return useMutation({
    mutationFn: async ({
      instanceId,
      provider,
    }: {
      instanceId: string;
      provider: CliproxyProvider;
    }) => {
      const response = await apiClient.post<{ data: CliproxyOAuthInitiateResult }>(
        `/admin/cliproxy/instances/${instanceId}/oauth-login`,
        { provider }
      );
      return response.data;
    },
  });
}

/**
 * 轮询 OAuth 登录状态。
 *
 * 状态为 `wait` 时按固定间隔继续轮询，`ok` 或 `error` 时停止。
 */
export function useCliproxyOAuthStatus(instanceId: string, state: string | null, enabled: boolean) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["cliproxy", "oauth-status", instanceId, state],
    queryFn: async () => {
      const response = await apiClient.get<{ data: CliproxyOAuthStatusResult }>(
        `/admin/cliproxy/instances/${instanceId}/oauth-login/status?state=${encodeURIComponent(
          state ?? ""
        )}`
      );
      return response.data;
    },
    enabled: enabled && Boolean(state),
    refetchInterval: (query) =>
      query.state.data?.status === "wait" ? CLIPROXY_OAUTH_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    gcTime: 0,
  });
}

/** 按服务商为指定实例一键创建 OAuth 池上游。 */
export function useCreateCliproxyPoolUpstream() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("cliproxy") as CliproxyTranslator;

  return useMutation({
    mutationFn: async ({
      instanceId,
      provider,
    }: {
      instanceId: string;
      provider: CliproxyUpstreamProvider;
    }) => {
      const response = await apiClient.post<{ data: { id: string } }>(
        `/admin/cliproxy/instances/${instanceId}/pool-upstreams`,
        { provider }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upstreams"] });
      toast.success(t("poolUpstreamCreateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(t("poolUpstreamCreateFailed", { message: error.message }));
    },
  });
}

/** 实例日志面板的默认拉取行数上限（前端裁剪）。 */
export const CLIPROXY_LOGS_DEFAULT_LIMIT = 200;

/** 实例日志查询的查询键。 */
const LOGS_QUERY_KEY = "logs";

/** 列出实例下关联的上游（池上游与单账号上游）。 */
export function useCliproxyLinkedUpstreams(instanceId: string | null) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["cliproxy", "linked-upstreams", instanceId],
    queryFn: async () => {
      const response = await apiClient.get<{ data: CliproxyLinkedUpstream[] }>(
        `/admin/cliproxy/instances/${instanceId}/linked-upstreams`
      );
      return response.data;
    },
    enabled: Boolean(instanceId),
  });
}

/** 查询某账号的 CLIProxyAPI 可用模型列表。 */
export function useCliproxyAccountModels(instanceId: string, authFileName: string | null) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["cliproxy", "account-models", instanceId, authFileName],
    queryFn: async () => {
      const response = await apiClient.get<{ data: CliproxyAuthFileModel[] }>(
        `/admin/cliproxy/instances/${instanceId}/auth-accounts/${encodeURIComponent(
          authFileName ?? ""
        )}/models`
      );
      return response.data;
    },
    enabled: Boolean(authFileName),
  });
}

/** 拉取实例的 CLIProxyAPI 运行日志，支持可选 since 时间戳过滤。 */
export function useCliproxyInstanceLogs(instanceId: string | null, since?: string) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["cliproxy", LOGS_QUERY_KEY, instanceId, since ?? null],
    queryFn: async () => {
      const sinceParam = since ? `?since=${encodeURIComponent(since)}` : "";
      const response = await apiClient.get<{ data: CliproxyLogEntry[] }>(
        `/admin/cliproxy/instances/${instanceId}/logs${sinceParam}`
      );
      return response.data;
    },
    enabled: Boolean(instanceId),
  });
}

/** 行内启停实例的快捷 mutation，复用既有实例更新端点仅修改 enabled。 */
export function useToggleCliproxyInstanceEnabled() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("cliproxy") as CliproxyTranslator;

  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const response = await apiClient.patch<{ data: CliproxyInstance }>(
        `/admin/cliproxy/instances/${id}`,
        { enabled }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliproxy", "instances"] });
    },
    onError: (error: Error) => {
      toast.error(t("instanceUpdateFailed", { message: error.message }));
    },
  });
}

/** 删除认证文件并清理本地缓存。 */
export function useDeleteCliproxyAuthFile() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("cliproxy") as CliproxyTranslator;

  return useMutation({
    mutationFn: async ({
      instanceId,
      authFileName,
    }: {
      instanceId: string;
      authFileName: string;
    }) => {
      const response = await apiClient.delete<{ data: { name: string } }>(
        `/admin/cliproxy/instances/${instanceId}/auth-files/${encodeURIComponent(authFileName)}`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliproxy", "accounts"] });
      toast.success(t("authFileDeleteSuccess"));
    },
    onError: (error: Error) => {
      toast.error(t("authFileDeleteFailed", { message: error.message }));
    },
  });
}

/** 上传认证文件至 CLIProxyAPI，成功后返回同步结果并刷新账号列表。 */
export function useUploadCliproxyAuthFile() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("cliproxy") as CliproxyTranslator;

  return useMutation({
    mutationFn: async ({
      instanceId,
      content,
    }: {
      instanceId: string;
      content: Record<string, unknown>;
    }) => {
      const response = await apiClient.post<{ data: CliproxyAuthAccountSyncResult }>(
        `/admin/cliproxy/instances/${instanceId}/auth-files`,
        content
      );
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["cliproxy", "accounts"] });
      toast.success(
        t("authFileUploadSuccess", {
          added: result.added,
          updated: result.updated,
          removed: result.removed,
        })
      );
    },
    onError: (error: Error) => {
      toast.error(t("authFileUploadFailed", { message: error.message }));
    },
  });
}

/**
 * 触发认证文件下载。
 *
 * 直接通过 fetch + Blob 走浏览器原生下载流程，绕过 apiClient 的 JSON 解析，
 * 避免大文件二次序列化。token 仍按 admin 鉴权约定注入到 Authorization 头。
 */
export function useDownloadCliproxyAuthFile() {
  const { token } = useAuth();
  const t = useTranslations("cliproxy") as CliproxyTranslator;

  return useMutation({
    mutationFn: async ({
      instanceId,
      authFileName,
    }: {
      instanceId: string;
      authFileName: string;
    }) => {
      const response = await fetch(
        `/api/admin/cliproxy/instances/${instanceId}/auth-files/${encodeURIComponent(
          authFileName
        )}`,
        {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = authFileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (error: Error) => {
      toast.error(t("authFileDownloadFailed", { message: error.message }));
    },
  });
}

/** 手动提交 OAuth 回调 URL，成功后返回同步结果。 */
export function useSubmitCliproxyOAuthCallback() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("cliproxy") as CliproxyTranslator;

  return useMutation({
    mutationFn: async ({
      instanceId,
      provider,
      redirectUrl,
    }: {
      instanceId: string;
      provider: CliproxyProvider;
      redirectUrl: string;
    }) => {
      const response = await apiClient.post<{ data: CliproxyOAuthStatusResult }>(
        `/admin/cliproxy/instances/${instanceId}/oauth-callback`,
        { provider, redirect_url: redirectUrl }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliproxy", "accounts"] });
      toast.success(t("oauthLoginSuccess"));
    },
    onError: (error: Error) => {
      toast.error(t("oauthCallbackSubmitFailed", { message: error.message }));
    },
  });
}

/** 将单个 OAuth 账号固定映射为一个上游。 */
export function useCreateCliproxySingleAccountUpstream() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("cliproxy") as CliproxyTranslator;

  return useMutation({
    mutationFn: async ({
      instanceId,
      accountName,
    }: {
      instanceId: string;
      accountName: string;
    }) => {
      const response = await apiClient.post<{ data: { id: string } }>(
        `/admin/cliproxy/instances/${instanceId}/auth-accounts/${encodeURIComponent(
          accountName
        )}/upstream`,
        {}
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upstreams"] });
      toast.success(t("accountUpstreamCreateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(t("accountUpstreamCreateFailed", { message: error.message }));
    },
  });
}
