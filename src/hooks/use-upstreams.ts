import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import type {
  Upstream,
  UpstreamCreate,
  UpstreamUpdate,
  PaginatedUpstreamsResponse,
  TestUpstreamResponse,
  UpstreamHealthResponse,
  UpstreamProbeListResponse,
  UpstreamProbeResponse,
  ExecuteUpstreamProbeRequest,
  UpstreamQuotaStatusResponse,
  UpstreamCatalogPreviewRequest,
  UpstreamCatalogPreviewResponse,
  UpstreamFailureRule,
  UpstreamFailureRuleCreate,
  UpstreamFailureRuleUpdate,
  UpstreamFailureRulesResponse,
} from "@/types/api";
import { toast } from "sonner";

type UpstreamsTranslator = (key: string, values?: Record<string, string | number | null>) => string;

function formatUpstreamError(t: UpstreamsTranslator, key: string, error: Error): string {
  return t(key, { message: error.message });
}

/**
 * Response type for upstream health endpoint
 */
interface UpstreamHealthListResponse {
  data: UpstreamHealthResponse[];
  total: number;
}

/**
 * Fetch paginated upstreams
 */
export function useUpstreams(page: number = 1, pageSize: number = 10) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["upstreams", page, pageSize],
    queryFn: () =>
      apiClient.get<PaginatedUpstreamsResponse>(
        `/admin/upstreams?page=${page}&page_size=${pageSize}`
      ),
  });
}

/**
 * Fetch all upstreams (for dropdowns/selection lists)
 */
export function useAllUpstreams() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["upstreams", "all"],
    queryFn: async () => {
      // Fetch first page to get total count
      const firstPage = await apiClient.get<PaginatedUpstreamsResponse>(
        `/admin/upstreams?page=1&page_size=100`
      );

      // If all items fit in first page, return them
      if (firstPage.items.length >= firstPage.total) {
        return firstPage.items;
      }

      // Otherwise, fetch remaining pages in parallel
      const totalPages = Math.ceil(firstPage.total / 100);
      const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

      const remainingPagesData = await Promise.all(
        remainingPages.map((page) =>
          apiClient.get<PaginatedUpstreamsResponse>(`/admin/upstreams?page=${page}&page_size=100`)
        )
      );

      // Combine all items
      return [...firstPage.items, ...remainingPagesData.flatMap((response) => response.items)];
    },
  });
}

/**
 * Create new upstream
 */
export function useCreateUpstream() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("upstreams") as UpstreamsTranslator;

  return useMutation({
    mutationFn: (data: UpstreamCreate) => apiClient.post<Upstream>("/admin/upstreams", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upstreams"] });
      queryClient.invalidateQueries({ queryKey: ["stats", "upstreams"] });
      queryClient.invalidateQueries({ queryKey: ["upstreams", "quota"] });
      toast.success(t("createSuccess"));
    },
    onError: (error: Error) => {
      toast.error(formatUpstreamError(t, "createFailed", error));
    },
  });
}

/**
 * Update upstream
 */
export function useUpdateUpstream() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("upstreams") as UpstreamsTranslator;

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpstreamUpdate }) =>
      apiClient.put<Upstream>(`/admin/upstreams/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upstreams"] });
      queryClient.invalidateQueries({ queryKey: ["upstreams", "quota"] });
      toast.success(t("updateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(formatUpstreamError(t, "updateFailed", error));
    },
  });
}

export function useUpstreamFailureRules(upstreamId: string | undefined, enabled: boolean = true) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["upstreams", upstreamId, "failure-rules"],
    queryFn: async () => {
      const response = await apiClient.get<UpstreamFailureRulesResponse>(
        `/admin/upstreams/${upstreamId}/failure-rules`
      );
      return response.data;
    },
    enabled: enabled && !!upstreamId,
  });
}

export function useGlobalUpstreamFailureRules(enabled: boolean = true) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["upstream-failure-rules", "global"],
    queryFn: async () => {
      const response = await apiClient.get<UpstreamFailureRulesResponse>(
        "/admin/upstream-failure-rules"
      );
      return response.data;
    },
    enabled,
  });
}

export function useCreateUpstreamFailureRule() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ upstreamId, data }: { upstreamId: string; data: UpstreamFailureRuleCreate }) =>
      apiClient.post<UpstreamFailureRule>(`/admin/upstreams/${upstreamId}/failure-rules`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["upstreams", variables.upstreamId, "failure-rules"],
      });
    },
  });
}

export function useCreateGlobalUpstreamFailureRule() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data }: { data: UpstreamFailureRuleCreate }) =>
      apiClient.post<UpstreamFailureRule>("/admin/upstream-failure-rules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["upstream-failure-rules", "global"],
      });
    },
  });
}

export function useUpdateUpstreamFailureRule() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      upstreamId: _upstreamId,
      ruleId,
      data,
    }: {
      upstreamId?: string;
      ruleId: string;
      data: UpstreamFailureRuleUpdate;
      scope?: "upstream" | "global";
    }) => apiClient.put<UpstreamFailureRule>(`/admin/upstream-failure-rules/${ruleId}`, data),
    onSuccess: (_data, variables) => {
      if (variables.scope === "global") {
        queryClient.invalidateQueries({
          queryKey: ["upstream-failure-rules", "global"],
        });
        return;
      }
      if (variables.upstreamId) {
        queryClient.invalidateQueries({
          queryKey: ["upstreams", variables.upstreamId, "failure-rules"],
        });
      }
    },
  });
}

export function useDeleteUpstreamFailureRule() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      upstreamId: _upstreamId,
      ruleId,
      scope: _scope,
    }: {
      upstreamId?: string;
      ruleId: string;
      scope?: "upstream" | "global";
    }) => apiClient.delete<{ success: boolean }>(`/admin/upstream-failure-rules/${ruleId}`),
    onSuccess: (_data, variables) => {
      if (variables.scope === "global") {
        queryClient.invalidateQueries({
          queryKey: ["upstream-failure-rules", "global"],
        });
        return;
      }
      if (variables.upstreamId) {
        queryClient.invalidateQueries({
          queryKey: ["upstreams", variables.upstreamId, "failure-rules"],
        });
      }
    },
  });
}

/**
 * Refresh upstream model catalog
 */
export function useRefreshUpstreamCatalog() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("upstreams") as UpstreamsTranslator;

  return useMutation({
    mutationFn: (id: string) => apiClient.post<Upstream>(`/admin/upstreams/${id}/catalog/refresh`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upstreams"] });
      toast.success(t("catalogRefreshSuccess"));
    },
    onError: (error: Error) => {
      toast.error(formatUpstreamError(t, "catalogRefreshFailed", error));
    },
  });
}

/**
 * Preview upstream model catalog with unsaved form values.
 */
export function usePreviewUpstreamCatalog() {
  const { apiClient } = useAuth();
  const t = useTranslations("upstreams") as UpstreamsTranslator;

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpstreamCatalogPreviewRequest }) =>
      apiClient.post<UpstreamCatalogPreviewResponse>(
        `/admin/upstreams/${id}/catalog/preview`,
        data
      ),
    onSuccess: () => {
      toast.success(t("catalogRefreshSuccess"));
    },
    onError: (error: Error) => {
      toast.error(formatUpstreamError(t, "catalogRefreshFailed", error));
    },
  });
}

/**
 * Import selected model catalog entries into upstream rules
 */
export function useImportUpstreamCatalogModels() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("upstreams") as UpstreamsTranslator;

  return useMutation({
    mutationFn: ({ id, models }: { id: string; models: string[] }) =>
      apiClient.post<Upstream>(`/admin/upstreams/${id}/catalog/import`, { models }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upstreams"] });
      toast.success(t("catalogImportSuccess"));
    },
    onError: (error: Error) => {
      toast.error(formatUpstreamError(t, "catalogImportFailed", error));
    },
  });
}

/**
 * Toggle upstream active status (optimistic update)
 */
export function useToggleUpstreamActive() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("upstreams") as UpstreamsTranslator;

  return useMutation<
    Upstream,
    Error,
    { id: string; nextActive: boolean },
    {
      previousPaginated: Array<[QueryKey, PaginatedUpstreamsResponse | undefined]>;
      previousAll: Upstream[] | undefined;
    }
  >({
    mutationFn: ({ id, nextActive }) =>
      apiClient.put<Upstream>(`/admin/upstreams/${id}`, { is_active: nextActive }),
    onMutate: async ({ id, nextActive }) => {
      await queryClient.cancelQueries({ queryKey: ["upstreams"] });

      const previousPaginated = queryClient.getQueriesData<PaginatedUpstreamsResponse>({
        queryKey: ["upstreams"],
        predicate: (query) =>
          query.queryKey[0] === "upstreams" && typeof query.queryKey[1] === "number",
      });

      const previousAll = queryClient.getQueryData<Upstream[]>(["upstreams", "all"]);

      queryClient.setQueriesData<PaginatedUpstreamsResponse>(
        {
          queryKey: ["upstreams"],
          predicate: (query) =>
            query.queryKey[0] === "upstreams" && typeof query.queryKey[1] === "number",
        },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((upstream) =>
              upstream.id === id ? { ...upstream, is_active: nextActive } : upstream
            ),
          };
        }
      );

      queryClient.setQueryData<Upstream[]>(["upstreams", "all"], (old) => {
        if (!old) return old;
        return old.map((upstream) =>
          upstream.id === id ? { ...upstream, is_active: nextActive } : upstream
        );
      });

      return { previousPaginated, previousAll };
    },
    onError: (error, _variables, context) => {
      if (context?.previousPaginated) {
        for (const [queryKey, data] of context.previousPaginated) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (context?.previousAll) {
        queryClient.setQueryData(["upstreams", "all"], context.previousAll);
      }
      toast.error(formatUpstreamError(t, "updateFailed", error));
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.nextActive ? t("enableSuccess") : t("disableSuccess"));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["upstreams"] });
      queryClient.invalidateQueries({ queryKey: ["upstreams", "health"] });
      queryClient.invalidateQueries({ queryKey: ["stats", "upstreams"] });
    },
  });
}

/**
 * Delete upstream
 */
export function useDeleteUpstream() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("upstreams") as UpstreamsTranslator;

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/upstreams/${id}`),
    onSuccess: (_data, id) => {
      // Immediately remove from cache to show deletion before refetch
      // Update paginated queries (format: PaginatedUpstreamsResponse with items array)
      queryClient.setQueriesData<PaginatedUpstreamsResponse>(
        {
          queryKey: ["upstreams"],
          predicate: (query) =>
            query.queryKey[0] === "upstreams" && typeof query.queryKey[1] === "number", // matches ["upstreams", page, pageSize]
        },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.filter((upstream) => upstream.id !== id),
            total: old.total - 1,
          };
        }
      );

      // Update "all" query (format: Upstream[] array)
      queryClient.setQueryData<Upstream[]>(["upstreams", "all"], (old) => {
        if (!old) return old;
        return old.filter((upstream) => upstream.id !== id);
      });

      queryClient.invalidateQueries({ queryKey: ["upstreams"] });
      queryClient.invalidateQueries({ queryKey: ["stats", "upstreams"] });
      toast.success(t("deleteSuccess"));
    },
    onError: (error: Error) => {
      toast.error(formatUpstreamError(t, "deleteFailed", error));
    },
  });
}

/**
 * Test upstream connection
 */
export function useTestUpstream() {
  const { apiClient } = useAuth();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<TestUpstreamResponse>(`/admin/upstreams/${id}/test`, {}),
  });
}

/**
 * Fetch diagnostic upstream probe results.
 */
export function useUpstreamProbes(upstreamId?: string, enabled: boolean = true) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: upstreamId ? ["upstreams", "probes", upstreamId] : ["upstreams", "probes"],
    queryFn: () =>
      apiClient.get<UpstreamProbeListResponse>(
        upstreamId ? `/admin/upstreams/${upstreamId}/probes` : "/admin/upstreams/probes"
      ),
    enabled,
  });
}

/**
 * Execute a diagnostic upstream probe.
 */
export function useExecuteUpstreamProbe() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("upstreams") as UpstreamsTranslator;

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: ExecuteUpstreamProbeRequest }) =>
      apiClient.post<UpstreamProbeResponse>(`/admin/upstreams/${id}/probes`, data ?? {}),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["upstreams", "probes"] });
      queryClient.invalidateQueries({ queryKey: ["upstreams", "probes", variables.id] });
      toast.success(t("probeSuccess"));
    },
    onError: (error: Error) => {
      toast.error(formatUpstreamError(t, "probeFailed", error));
    },
  });
}

/**
 * Fetch upstream health status
 * @param groupId - Optional group ID to filter by
 * @param activeOnly - Whether to only include active upstreams (default: true)
 */
export function useUpstreamHealth(activeOnly: boolean = true) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["upstreams", "health", activeOnly],
    queryFn: () => {
      const params = new URLSearchParams();
      if (!activeOnly) {
        params.set("active_only", "false");
      }
      const queryString = params.toString();
      const url = `/admin/upstreams/health${queryString ? `?${queryString}` : ""}`;
      return apiClient.get<UpstreamHealthListResponse>(url);
    },
    // Refetch health status every 30 seconds
    refetchInterval: 30000,
  });
}

/**
 * Fetch upstream spending quota statuses
 */
export function useUpstreamQuota() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["upstreams", "quota"],
    queryFn: () => apiClient.get<UpstreamQuotaStatusResponse>("/admin/upstreams/quota"),
    refetchInterval: 60000,
  });
}

/**
 * Force sync quota data from database
 */
export function useSyncUpstreamQuota() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post<{ synced: boolean }>("/admin/upstreams/quota", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upstreams", "quota"] });
    },
  });
}
