import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import type {
  CliproxyInstance,
  CliproxyInstanceCreate,
  CliproxyInstanceUpdate,
  CliproxyConnectionTestResult,
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
