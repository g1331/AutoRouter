import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type {
  Upstream,
  UpstreamCreate,
  UpstreamUpdate,
  PaginatedUpstreamsResponse,
  TestUpstreamResponse,
  UpstreamHealthResponse,
  UpstreamQuotaStatusResponse,
} from "@/types/api";
import { toast } from "sonner";

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

  return useMutation({
    mutationFn: (data: UpstreamCreate) => apiClient.post<Upstream>("/admin/upstreams", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upstreams"] });
      queryClient.invalidateQueries({ queryKey: ["stats", "upstreams"] });
      queryClient.invalidateQueries({ queryKey: ["upstreams", "quota"] });
      toast.success("Upstream 已创建");
    },
    onError: (error: Error) => {
      toast.error(`创建失败: ${error.message}`);
    },
  });
}

/**
 * Update upstream
 */
export function useUpdateUpstream() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpstreamUpdate }) =>
      apiClient.put<Upstream>(`/admin/upstreams/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upstreams"] });
      queryClient.invalidateQueries({ queryKey: ["upstreams", "quota"] });
      toast.success("Upstream 已更新");
    },
    onError: (error: Error) => {
      toast.error(`更新失败: ${error.message}`);
    },
  });
}

/**
 * Toggle upstream active status (optimistic update)
 */
export function useToggleUpstreamActive() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

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
      toast.error(`更新失败: ${error.message}`);
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.nextActive ? "Upstream 已启用" : "Upstream 已停用");
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
      toast.success("Upstream 已删除");
    },
    onError: (error: Error) => {
      toast.error(`删除失败: ${error.message}`);
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
