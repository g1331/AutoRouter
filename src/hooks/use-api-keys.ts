import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import type {
  APIKeyCreate,
  APIKeyCreateResponse,
  APIKeyRevealResponse,
  APIKeyResponse,
  APIKeyUpdate,
  PaginatedAPIKeysResponse,
} from "@/types/api";
import { ApiError } from "@/lib/api";
import { toast } from "sonner";

export interface APIKeysScope {
  /**
   * Which keys to list. The API defaults to "unowned", so member-owned keys
   * stay out of the global list and are managed from the owner's view.
   */
  ownerScope?: "unowned" | "all";
  /** List one user's keys; takes precedence over ownerScope. */
  userId?: string;
}

/**
 * Fetch paginated API keys with an optional server-side name search
 */
export function useAPIKeys(
  page: number = 1,
  pageSize: number = 10,
  search: string = "",
  scope: APIKeysScope = {}
) {
  const { apiClient } = useAuth();
  const { ownerScope, userId } = scope;

  return useQuery({
    queryKey: ["api-keys", page, pageSize, search, ownerScope ?? null, userId ?? null],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (search) {
        params.set("search", search);
      }
      if (userId) {
        params.set("user_id", userId);
      } else if (ownerScope) {
        params.set("owner_scope", ownerScope);
      }
      return apiClient.get<PaginatedAPIKeysResponse>(`/admin/keys?${params.toString()}`);
    },
    // Keep previous data during search/pagination to avoid layout jumps.
    placeholderData: (previous) => previous,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["stats", "keys"] });
      toast.success(t("updateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(`${t("updateFailed")}: ${error.message}`);
    },
  });
}

/**
 * Fetch a single API key by id (detail page).
 */
export function useApiKey(id: string | undefined, enabled: boolean = true) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["keys", id],
    queryFn: () => apiClient.get<APIKeyResponse>(`/admin/keys/${id}`),
    enabled: enabled && !!id,
  });
}

/**
 * Update a single API-key section (detail-page partial PUT).
 *
 * Modeled on the upstream `useUpdateUpstreamSection`: the passed `payload`
 * carries only the editing section's fields and is optimistically shallow-merged
 * into the detail (`["keys", id]`) and paginated (`["api-keys", …]`) caches,
 * rolling back on error. On success the authoritative server response replaces
 * the detail cache; `onSettled` invalidates both the single-key query and the
 * list caches so no section reads stale data after another section saves.
 */
export function useUpdateApiKeySection() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("keys");

  return useMutation<
    APIKeyResponse,
    Error,
    { id: string; payload: APIKeyUpdate },
    {
      previousDetail: APIKeyResponse | undefined;
      previousPaginated: Array<[QueryKey, PaginatedAPIKeysResponse | undefined]>;
    }
  >({
    mutationFn: ({ id, payload }) => apiClient.put<APIKeyResponse>(`/admin/keys/${id}`, payload),
    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey: ["keys", id] });
      await queryClient.cancelQueries({ queryKey: ["api-keys"] });

      const previousDetail = queryClient.getQueryData<APIKeyResponse>(["keys", id]);
      const previousPaginated = queryClient.getQueriesData<PaginatedAPIKeysResponse>({
        queryKey: ["api-keys"],
      });

      if (previousDetail) {
        queryClient.setQueryData<APIKeyResponse>(["keys", id], {
          ...previousDetail,
          ...payload,
        } as APIKeyResponse);
      }

      queryClient.setQueriesData<PaginatedAPIKeysResponse>({ queryKey: ["api-keys"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((key) =>
            key.id === id ? ({ ...key, ...payload } as APIKeyResponse) : key
          ),
        };
      });

      return { previousDetail, previousPaginated };
    },
    onError: (error, { id }, context) => {
      if (context?.previousDetail !== undefined) {
        queryClient.setQueryData(["keys", id], context.previousDetail);
      }
      if (context?.previousPaginated) {
        for (const [queryKey, data] of context.previousPaginated) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      toast.error(`${t("updateFailed")}: ${error.message}`);
    },
    onSuccess: (updated, { id }) => {
      queryClient.setQueryData(["keys", id], updated);
      toast.success(t("updateSuccess"));
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["keys", id] });
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["stats", "keys"] });
    },
  });
}

/**
 * Toggle API key active status (optimistic update)
 */
export function useToggleAPIKeyActive() {
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
      apiClient.put<APIKeyResponse>(`/admin/keys/${id}`, { is_active: nextActive }),
    onMutate: async ({ id, nextActive }) => {
      await queryClient.cancelQueries({ queryKey: ["api-keys"] });

      const previous = queryClient.getQueriesData<PaginatedAPIKeysResponse>({
        queryKey: ["api-keys"],
      });

      queryClient.setQueriesData<PaginatedAPIKeysResponse>({ queryKey: ["api-keys"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((key) => (key.id === id ? { ...key, is_active: nextActive } : key)),
        };
      });

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
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["stats", "keys"] });
    },
  });
}
