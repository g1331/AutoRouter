import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type {
  APIKey,
  APIKeyCreate,
  APIKeyCreateResponse,
  PaginatedAPIKeysResponse,
} from "@/types/api";
import { toast } from "sonner";

/**
 * Fetch paginated API keys
 */
export function useAPIKeys(page: number = 1, pageSize: number = 10) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["api-keys", page, pageSize],
    queryFn: () =>
      apiClient.get<PaginatedAPIKeysResponse>(
        `/admin/keys?page=${page}&page_size=${pageSize}`
      ),
  });
}

/**
 * Create new API key
 */
export function useCreateAPIKey() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: APIKeyCreate) =>
      apiClient.post<APIKeyCreateResponse>("/admin/keys", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["stats", "keys"] });
    },
    onError: (error: Error) => {
      toast.error(`创建失败: ${error.message}`);
    },
  });
}

/**
 * Revoke API key
 */
export function useRevokeAPIKey() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keyId: string) => apiClient.delete(`/admin/keys/${keyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["stats", "keys"] });
      toast.success("API Key 已撤销");
    },
    onError: (error: Error) => {
      toast.error(`撤销失败: ${error.message}`);
    },
  });
}
