import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type {
  UpstreamGroup,
  UpstreamGroupCreate,
  UpstreamGroupUpdate,
  PaginatedUpstreamGroupsResponse,
} from "@/types/api";
import { toast } from "sonner";

/**
 * Fetch paginated upstream groups
 */
export function useUpstreamGroups(page: number = 1, pageSize: number = 10) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["upstream-groups", page, pageSize],
    queryFn: () =>
      apiClient.get<PaginatedUpstreamGroupsResponse>(
        `/admin/upstreams/groups?page=${page}&page_size=${pageSize}`
      ),
  });
}

/**
 * Fetch all upstream groups (for dropdowns/selection lists)
 */
export function useAllUpstreamGroups() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["upstream-groups", "all"],
    queryFn: async () => {
      // Fetch first page to get total count
      const firstPage = await apiClient.get<PaginatedUpstreamGroupsResponse>(
        `/admin/upstreams/groups?page=1&page_size=100`
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
          apiClient.get<PaginatedUpstreamGroupsResponse>(
            `/admin/upstreams/groups?page=${page}&page_size=100`
          )
        )
      );

      // Combine all items
      return [...firstPage.items, ...remainingPagesData.flatMap((response) => response.items)];
    },
  });
}

/**
 * Create new upstream group
 */
export function useCreateUpstreamGroup() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpstreamGroupCreate) =>
      apiClient.post<UpstreamGroup>("/admin/upstreams/groups", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upstream-groups"] });
      toast.success("Upstream Group 已创建");
    },
    onError: (error: Error) => {
      toast.error(`创建失败: ${error.message}`);
    },
  });
}

/**
 * Update upstream group
 */
export function useUpdateUpstreamGroup() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpstreamGroupUpdate }) =>
      apiClient.put<UpstreamGroup>(`/admin/upstreams/groups/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upstream-groups"] });
      toast.success("Upstream Group 已更新");
    },
    onError: (error: Error) => {
      toast.error(`更新失败: ${error.message}`);
    },
  });
}

/**
 * Delete upstream group
 */
export function useDeleteUpstreamGroup() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/upstreams/groups/${id}`),
    onSuccess: (_data, id) => {
      // Immediately remove from cache to show deletion before refetch
      // Update paginated queries (format: PaginatedUpstreamGroupsResponse with items array)
      queryClient.setQueriesData<PaginatedUpstreamGroupsResponse>(
        {
          queryKey: ["upstream-groups"],
          predicate: (query) =>
            query.queryKey[0] === "upstream-groups" && typeof query.queryKey[1] === "number", // matches ["upstream-groups", page, pageSize]
        },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.filter((group) => group.id !== id),
            total: old.total - 1,
          };
        }
      );

      // Update "all" query (format: UpstreamGroup[] array)
      queryClient.setQueryData<UpstreamGroup[]>(["upstream-groups", "all"], (old) => {
        if (!old) return old;
        return old.filter((group) => group.id !== id);
      });

      queryClient.invalidateQueries({ queryKey: ["upstream-groups"] });
      // Also invalidate upstreams as they reference groups
      queryClient.invalidateQueries({ queryKey: ["upstreams"] });
      toast.success("Upstream Group 已删除");
    },
    onError: (error: Error) => {
      toast.error(`删除失败: ${error.message}`);
    },
  });
}
