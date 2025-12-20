import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import type {
  APIKeyCreate,
  APIKeyCreateResponse,
  APIKeyRevealResponse,
  PaginatedAPIKeysResponse,
} from "@/types/api";
import { ApiError } from "@/lib/api";
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
 * Reveal API key full value
 */
export function useRevealAPIKey() {
  const { apiClient } = useAuth();
  const t = useTranslations("keys");
  const tCommon = useTranslations("common");

  return useMutation({
    mutationFn: (keyId: string) =>
      apiClient.post<APIKeyRevealResponse>(`/admin/keys/${keyId}/reveal`),
    onError: (error: Error) => {
      if (error instanceof ApiError) {
        const detail =
          error.detail as { error?: string; message?: string } | undefined;
        if (detail?.error === "legacy_key") {
          toast.error(t("legacyKey"));
          return;
        }
      }
      toast.error(tCommon("error"));
    },
  });
}

/**
 * Delete API key
 */
export function useRevokeAPIKey() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keyId: string) => apiClient.delete<void>(`/admin/keys/${keyId}`),
    onSuccess: (_data, keyId) => {
      // Immediately remove from cache to show deletion before refetch
      queryClient.setQueriesData<PaginatedAPIKeysResponse>(
        { queryKey: ["api-keys"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.filter((key) => key.id !== keyId),
            total: old.total - 1,
          };
        }
      );

      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["stats", "keys"] });
      toast.success("API Key 已删除");
    },
    onError: (error: Error) => {
      toast.error(`删除失败: ${error.message}`);
    },
  });
}
