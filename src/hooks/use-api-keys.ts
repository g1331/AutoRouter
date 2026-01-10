import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import type {
  APIKeyCreate,
  APIKeyCreateResponse,
  APIKeyRevealResponse,
  APIKeyUpdate,
  APIKeyResponse,
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
      apiClient.get<PaginatedAPIKeysResponse>(`/admin/keys?page=${page}&page_size=${pageSize}`),
  });
}

/**
 * Create new API key
 */
export function useCreateAPIKey() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("keys");

  return useMutation({
    mutationFn: (data: APIKeyCreate) => apiClient.post<APIKeyCreateResponse>("/admin/keys", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["stats", "keys"] });
    },
    onError: (error: Error) => {
      toast.error(`${t("createFailed")}: ${error.message}`);
    },
  });
}

/**
 * Update API key
 */
export function useUpdateAPIKey() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("keys");

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: APIKeyUpdate }) =>
      apiClient.put<APIKeyResponse>(`/admin/keys/${id}`, data),
    onMutate: async ({ id, data }) => {
      // Cancel any outgoing refetches to prevent overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: ["api-keys"] });

      // Snapshot the previous value
      const previousKeys = queryClient.getQueriesData<PaginatedAPIKeysResponse>({
        queryKey: ["api-keys"],
      });

      // Optimistically update the cache
      queryClient.setQueriesData<PaginatedAPIKeysResponse>({ queryKey: ["api-keys"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((key) =>
            key.id === id
              ? {
                  ...key,
                  ...data,
                  // Handle snake_case to camelCase conversion for optimistic update
                  name: data.name ?? key.name,
                  description: data.description !== undefined ? data.description : key.description,
                  isActive: data.is_active ?? key.is_active,
                  expiresAt: data.expires_at !== undefined ? data.expires_at : key.expires_at,
                  upstreamIds: data.upstream_ids ?? key.upstream_ids,
                  updatedAt: new Date().toISOString(),
                }
              : key
          ),
        };
      });

      // Return context with the snapshot
      return { previousKeys };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success(t("updateSuccess"));
    },
    onError: (error: Error, _variables, context) => {
      // Rollback to previous state on error
      if (context?.previousKeys) {
        context.previousKeys.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error(`${t("updateFailed")}: ${error.message}`);
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
        const detail = error.detail as { error?: string; message?: string } | undefined;
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
  const t = useTranslations("keys");

  return useMutation({
    mutationFn: (keyId: string) => apiClient.delete<void>(`/admin/keys/${keyId}`),
    onSuccess: (_data, keyId) => {
      // Immediately remove from cache to show deletion before refetch
      queryClient.setQueriesData<PaginatedAPIKeysResponse>({ queryKey: ["api-keys"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.filter((key) => key.id !== keyId),
          total: old.total - 1,
        };
      });

      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["stats", "keys"] });
      toast.success(t("revokeSuccess"));
    },
    onError: (error: Error) => {
      toast.error(`${t("revokeFailed")}: ${error.message}`);
    },
  });
}
