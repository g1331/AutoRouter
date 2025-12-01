import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type {
  Upstream,
  UpstreamCreate,
  UpstreamUpdate,
  PaginatedUpstreamsResponse,
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
 * Create new upstream
 */
export function useCreateUpstream() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpstreamCreate) =>
      apiClient.post<Upstream>("/admin/upstreams", data),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upstreams"] });
      queryClient.invalidateQueries({ queryKey: ["stats", "upstreams"] });
      toast.success("Upstream 已删除");
    },
    onError: (error: Error) => {
      toast.error(`删除失败: ${error.message}`);
    },
  });
}
