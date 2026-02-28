import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";
import type {
  BillingOverviewResponse,
  BillingSyncResponse,
  BillingManualOverride,
  BillingCreateManualOverride,
  BillingUpdateManualOverride,
  BillingManualOverridesResponse,
  PaginatedBillingModelPricesResponse,
  BillingUnresolvedModelsResponse,
  UpstreamBillingMultiplier,
  UpstreamBillingMultipliersResponse,
  UpdateUpstreamBillingMultiplier,
  PaginatedRecentBillingDetailsResponse,
} from "@/types/api";

export function useBillingOverview() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["billing", "overview"],
    queryFn: () => apiClient.get<BillingOverviewResponse>("/admin/billing/overview"),
  });
}

export function useBillingUnresolvedModels() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["billing", "unresolved-models"],
    queryFn: () =>
      apiClient.get<BillingUnresolvedModelsResponse>("/admin/billing/prices/unresolved"),
  });
}

export function useBillingManualOverrides() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["billing", "manual-overrides"],
    queryFn: () => apiClient.get<BillingManualOverridesResponse>("/admin/billing/overrides"),
  });
}

export function useBillingModelPrices(
  page: number = 1,
  pageSize: number = 50,
  modelQuery?: string
) {
  const { apiClient } = useAuth();
  const normalizedQuery = modelQuery?.trim() ?? "";

  return useQuery({
    queryKey: ["billing", "model-prices", page, pageSize, normalizedQuery],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (normalizedQuery) {
        params.set("model", normalizedQuery);
      }
      return apiClient.get<PaginatedBillingModelPricesResponse>(`/admin/billing/prices?${params}`);
    },
    // Keep previous data during search/pagination to avoid layout jumps.
    placeholderData: (previous) => previous,
  });
}

export function useCreateBillingManualOverride() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BillingCreateManualOverride) =>
      apiClient.post<BillingManualOverride>("/admin/billing/overrides", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "manual-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "unresolved-models"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "model-prices"] });
      toast.success("手动价格已保存");
    },
    onError: (error: Error) => {
      toast.error(`保存失败: ${error.message}`);
    },
  });
}

export function useUpdateBillingManualOverride() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: BillingUpdateManualOverride }) =>
      apiClient.put<BillingManualOverride>(`/admin/billing/overrides/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "manual-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "unresolved-models"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "model-prices"] });
      toast.success("手动价格已更新");
    },
    onError: (error: Error) => {
      toast.error(`更新失败: ${error.message}`);
    },
  });
}

export function useDeleteBillingManualOverride() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/admin/billing/overrides/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "manual-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "unresolved-models"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "model-prices"] });
      toast.success("手动价格已删除");
    },
    onError: (error: Error) => {
      toast.error(`删除失败: ${error.message}`);
    },
  });
}

export function useSyncBillingPrices() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post<BillingSyncResponse>("/admin/billing/prices/sync"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "unresolved-models"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "model-prices"] });
      toast.success("价格同步已完成");
    },
    onError: (error: Error) => {
      toast.error(`同步失败: ${error.message}`);
    },
  });
}

export function useUpstreamBillingMultipliers() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["billing", "upstream-multipliers"],
    queryFn: () =>
      apiClient.get<UpstreamBillingMultipliersResponse>("/admin/billing/upstream-multipliers"),
  });
}

export function useUpdateUpstreamBillingMultiplier() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUpstreamBillingMultiplier }) =>
      apiClient.put<UpstreamBillingMultiplier>(`/admin/billing/upstream-multipliers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "upstream-multipliers"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["upstreams"] });
      toast.success("倍率更新成功");
    },
    onError: (error: Error) => {
      toast.error(`倍率更新失败: ${error.message}`);
    },
  });
}

export function useRecentBillingDetails(page: number = 1, pageSize: number = 20) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["billing", "recent", page, pageSize],
    queryFn: () =>
      apiClient.get<PaginatedRecentBillingDetailsResponse>(
        `/admin/billing/recent?page=${page}&page_size=${pageSize}`
      ),
  });
}
