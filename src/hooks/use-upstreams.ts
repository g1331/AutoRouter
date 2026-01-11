import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type {
  Upstream,
  UpstreamCreate,
  UpstreamUpdate,
  PaginatedUpstreamsResponse,
  TestUpstreamResponse,
} from "@/types/api";
import { toast } from "sonner";

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
      toast.success("Upstream 已更新");
    },
    onError: (error: Error) => {
      toast.error(`更新失败: ${error.message}`);
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
