import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";
import type {
  BillingOverviewResponse,
  BillingSyncResponse,
  BillingManualOverride,
  BillingCreateManualOverride,
  BillingUpdateManualOverride,
  BillingManualOverridesResponse,
  BillingResetManualOverridesResponse,
  PaginatedBillingModelPricesResponse,
  BillingUnresolvedModelsResponse,
  UpstreamBillingMultiplier,
  UpstreamBillingMultipliersResponse,
  UpdateUpstreamBillingMultiplier,
  PaginatedRecentBillingDetailsResponse,
  BillingTierRule,
  BillingTierRulesResponse,
  BillingCreateTierRule,
  BillingUpdateTierRule,
} from "@/types/api";

type BillingTranslator = (key: string, values?: Record<string, string | number | null>) => string;

function getBillingErrorMessage(error: Error): string {
  return error.message;
}

function formatBillingError(t: BillingTranslator, key: string, error: Error): string {
  return t(key, { message: getBillingErrorMessage(error) });
}

function isTierRuleConflict(error: Error): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 409;
}

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
  const t = useTranslations("billing") as BillingTranslator;

  return useMutation({
    mutationFn: (data: BillingCreateManualOverride) =>
      apiClient.post<BillingManualOverride>("/admin/billing/overrides", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "manual-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "unresolved-models"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "model-prices"] });
      toast.success(t("manualOverrideSaveSuccess"));
    },
    onError: (error: Error) => {
      toast.error(formatBillingError(t, "manualOverrideSaveError", error));
    },
  });
}

export function useUpdateBillingManualOverride() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("billing") as BillingTranslator;

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: BillingUpdateManualOverride }) =>
      apiClient.put<BillingManualOverride>(`/admin/billing/overrides/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "manual-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "unresolved-models"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "model-prices"] });
      toast.success(t("manualOverrideUpdateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(formatBillingError(t, "manualOverrideUpdateError", error));
    },
  });
}

export function useDeleteBillingManualOverride() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("billing") as BillingTranslator;

  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/admin/billing/overrides/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "manual-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "unresolved-models"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "model-prices"] });
      toast.success(t("manualOverrideDeleteSuccess"));
    },
    onError: (error: Error) => {
      toast.error(formatBillingError(t, "manualOverrideDeleteError", error));
    },
  });
}

export function useResetBillingManualOverrides() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("billing") as BillingTranslator;

  return useMutation({
    mutationFn: (models: string[]) =>
      apiClient.post<BillingResetManualOverridesResponse>("/admin/billing/overrides/reset", {
        models,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["billing", "manual-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "unresolved-models"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "model-prices"] });

      if (result.deleted_count > 0) {
        toast.success(t("manualOverrideResetSuccess", { count: result.deleted_count }));
      } else {
        toast.message(t("manualOverrideResetEmpty"));
      }

      if (result.missing_official_models.length > 0) {
        toast.warning(
          t("manualOverrideResetWarningNoOfficial", {
            count: result.missing_official_models.length,
          })
        );
      }
    },
    onError: (error: Error) => {
      toast.error(formatBillingError(t, "manualOverrideResetError", error));
    },
  });
}

export function useSyncBillingPrices() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("billing") as BillingTranslator;

  return useMutation({
    mutationFn: () => apiClient.post<BillingSyncResponse>("/admin/billing/prices/sync"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "unresolved-models"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "model-prices"] });
      toast.success(t("syncCompleteSuccess"));
    },
    onError: (error: Error) => {
      toast.error(formatBillingError(t, "syncFailedError", error));
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
  const t = useTranslations("billing") as BillingTranslator;

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUpstreamBillingMultiplier }) =>
      apiClient.put<UpstreamBillingMultiplier>(`/admin/billing/upstream-multipliers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "upstream-multipliers"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["upstreams"] });
      toast.success(t("upstreamMultiplierUpdateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(formatBillingError(t, "upstreamMultiplierUpdateError", error));
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

export function useBillingTierRules(model?: string, source?: "litellm" | "manual") {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["billing", "tier-rules", model, source],
    queryFn: () => {
      const params = new URLSearchParams();
      if (model) params.set("model", model);
      if (source) params.set("source", source);
      const query = params.toString();
      return apiClient.get<BillingTierRulesResponse>(
        query ? `/admin/billing/tier-rules?${query}` : "/admin/billing/tier-rules"
      );
    },
  });
}

export function useBillingTierRulesForModel(model: string) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["billing", "tier-rules", model],
    queryFn: () =>
      apiClient.get<BillingTierRulesResponse>(
        `/admin/billing/tier-rules?model=${encodeURIComponent(model)}`
      ),
    enabled: !!model,
  });
}

export function useCreateBillingTierRule() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("billing") as BillingTranslator;

  return useMutation({
    mutationFn: (data: BillingCreateTierRule) =>
      apiClient.post<BillingTierRule>("/admin/billing/tier-rules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "tier-rules"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "model-prices"] });
      toast.success(t("tierRulesAddSuccess"));
    },
    onError: (error: Error) => {
      if (isTierRuleConflict(error)) {
        toast.error(t("tierRulesDuplicateThresholdError"));
        return;
      }
      toast.error(formatBillingError(t, "tierRulesCreateError", error));
    },
  });
}

export function useUpdateBillingTierRule() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("billing") as BillingTranslator;

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: BillingUpdateTierRule }) =>
      apiClient.put<BillingTierRule>(`/admin/billing/tier-rules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "tier-rules"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "model-prices"] });
      toast.success(t("tierRulesToggleSuccess"));
    },
    onError: (error: Error) => {
      toast.error(formatBillingError(t, "tierRulesUpdateError", error));
    },
  });
}

export function useDeleteBillingTierRule() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("billing") as BillingTranslator;

  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/admin/billing/tier-rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "tier-rules"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "model-prices"] });
      toast.success(t("tierRulesDeleteSuccess"));
    },
    onError: (error: Error) => {
      toast.error(formatBillingError(t, "tierRulesDeleteError", error));
    },
  });
}
