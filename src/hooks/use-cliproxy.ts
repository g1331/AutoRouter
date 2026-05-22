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
  CliproxyOAuthInitiateResult,
  CliproxyOAuthStatusResult,
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
      provider: CliproxyProvider;
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
