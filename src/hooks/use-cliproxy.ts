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
} from "@/types/cliproxy";

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
