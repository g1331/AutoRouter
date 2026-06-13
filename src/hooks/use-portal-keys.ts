import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import type {
  APIKeyCreateResponse,
  APIKeyResponse,
  PaginatedAPIKeysResponse,
  PortalKeyCreate,
  PortalKeyUpdate,
  PortalUpstreamOptionsResponse,
} from "@/types/api";
import { toast } from "sonner";

/**
 * Fetch the caller's own API keys (paginated).
 */
export function usePortalKeys(page: number = 1, pageSize: number = 10) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["portal", "keys", page, pageSize],
    queryFn: () =>
      apiClient.get<PaginatedAPIKeysResponse>(`/user/keys?page=${page}&page_size=${pageSize}`),
  });
}

/**
 * Fetch the upstreams the caller may authorize on self-service keys
 * (the admin-granted user_upstreams set).
 */
export function usePortalUpstreamOptions() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["portal", "upstreams"],
    queryFn: () => apiClient.get<PortalUpstreamOptionsResponse>("/user/upstreams"),
  });
}

/**
 * Create a self-service API key owned by the caller.
 */
export function useCreatePortalKey() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("keys");

  return useMutation({
    mutationFn: (data: PortalKeyCreate) => apiClient.post<APIKeyCreateResponse>("/user/keys", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "keys"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "overview"] });
    },
    onError: (error: Error) => {
      toast.error(`${t("createFailed")}: ${error.message}`);
    },
  });
}

/**
 * Update one of the caller's own API keys.
 */
export function useUpdatePortalKey() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("keys");

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PortalKeyUpdate }) =>
      apiClient.put<APIKeyResponse>(`/user/keys/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "keys"] });
      toast.success(t("updateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(`${t("updateFailed")}: ${error.message}`);
    },
  });
}

/**
 * Toggle one of the caller's own keys active/inactive (optimistic update).
 */
export function useTogglePortalKeyActive() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("keys");

  return useMutation<
    APIKeyResponse,
    Error,
    { id: string; nextActive: boolean },
    { previous: Array<[QueryKey, PaginatedAPIKeysResponse | undefined]> }
  >({
    mutationFn: ({ id, nextActive }) =>
      apiClient.put<APIKeyResponse>(`/user/keys/${id}`, { is_active: nextActive }),
    onMutate: async ({ id, nextActive }) => {
      await queryClient.cancelQueries({ queryKey: ["portal", "keys"] });

      const previous = queryClient.getQueriesData<PaginatedAPIKeysResponse>({
        queryKey: ["portal", "keys"],
      });

      queryClient.setQueriesData<PaginatedAPIKeysResponse>(
        { queryKey: ["portal", "keys"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((key) =>
              key.id === id ? { ...key, is_active: nextActive } : key
            ),
          };
        }
      );

      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        for (const [queryKey, data] of context.previous) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      toast.error(`${t("updateFailed")}: ${error.message}`);
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.nextActive ? t("enableSuccess") : t("disableSuccess"));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "keys"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "overview"] });
    },
  });
}

/**
 * Delete one of the caller's own API keys.
 */
export function useDeletePortalKey() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("keys");

  return useMutation({
    mutationFn: (keyId: string) => apiClient.delete<void>(`/user/keys/${keyId}`),
    onSuccess: (_data, keyId) => {
      queryClient.setQueriesData<PaginatedAPIKeysResponse>(
        { queryKey: ["portal", "keys"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.filter((key) => key.id !== keyId),
            total: old.total - 1,
          };
        }
      );

      queryClient.invalidateQueries({ queryKey: ["portal", "keys"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "overview"] });
      toast.success(t("revokeSuccess"));
    },
    onError: (error: Error) => {
      toast.error(`${t("revokeFailed")}: ${error.message}`);
    },
  });
}
