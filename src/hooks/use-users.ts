import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import type {
  User,
  PaginatedUsersResponse,
  UserCreate,
  UserUpdate,
  UserUpstreamsResponse,
} from "@/types/api";

/**
 * Fetch paginated users with their owned API key counts.
 */
export function useUsers(page: number = 1, pageSize: number = 10) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["users", page, pageSize],
    queryFn: () =>
      apiClient.get<PaginatedUsersResponse>(`/admin/users?page=${page}&page_size=${pageSize}`),
  });
}

/**
 * Create a new user account.
 */
export function useCreateUser() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("users");

  return useMutation({
    mutationFn: (data: UserCreate) => apiClient.post<User>("/admin/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("createSuccess"));
    },
    onError: (error: Error) => {
      toast.error(`${t("createFailed")}: ${error.message}`);
    },
  });
}

/**
 * Update a user's profile, role, or active state.
 */
export function useUpdateUser() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("users");

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserUpdate }) =>
      apiClient.put<User>(`/admin/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("updateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(`${t("updateFailed")}: ${error.message}`);
    },
  });
}

/**
 * Toggle a user's active state (enable / disable).
 */
export function useToggleUserActive() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("users");

  return useMutation({
    mutationFn: ({ id, nextActive }: { id: string; nextActive: boolean }) =>
      apiClient.put<User>(`/admin/users/${id}`, { is_active: nextActive }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(variables.nextActive ? t("enableSuccess") : t("disableSuccess"));
    },
    onError: (error: Error) => {
      toast.error(`${t("updateFailed")}: ${error.message}`);
    },
  });
}

/**
 * Change a user's login username.
 */
export function useChangeUsername() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("users");

  return useMutation({
    mutationFn: ({ id, username }: { id: string; username: string }) =>
      apiClient.put<User>(`/admin/users/${id}/username`, { username }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("usernameUpdateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(`${t("usernameUpdateFailed")}: ${error.message}`);
    },
  });
}

/**
 * Reset a user's password to an administrator-supplied value.
 */
export function useResetUserPassword() {
  const { apiClient } = useAuth();
  const t = useTranslations("users");

  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiClient.put<void>(`/admin/users/${id}/password`, { password }),
    onSuccess: () => {
      toast.success(t("passwordResetSuccess"));
    },
    onError: (error: Error) => {
      toast.error(`${t("passwordResetFailed")}: ${error.message}`);
    },
  });
}

/**
 * Delete a user, detaching ownership of any API keys they hold.
 */
export function useDeleteUser() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("users");

  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/admin/users/${id}`),
    onSuccess: (_data, id) => {
      queryClient.setQueriesData<PaginatedUsersResponse>({ queryKey: ["users"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.filter((user) => user.id !== id),
          total: old.total - 1,
        };
      });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("deleteSuccess"));
    },
    onError: (error: Error) => {
      toast.error(`${t("deleteFailed")}: ${error.message}`);
    },
  });
}

/**
 * Fetch the set of upstreams a user is allowed to route to.
 */
export function useUserUpstreams(userId: string | undefined, enabled: boolean = true) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["users", userId, "upstreams"],
    queryFn: () => apiClient.get<UserUpstreamsResponse>(`/admin/users/${userId}/upstreams`),
    enabled: enabled && !!userId,
  });
}

/**
 * Replace the set of upstreams available to a user.
 */
export function useSetUserUpstreams() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("users");

  return useMutation({
    mutationFn: ({ id, upstreamIds }: { id: string; upstreamIds: string[] }) =>
      apiClient.put<UserUpstreamsResponse>(`/admin/users/${id}/upstreams`, {
        upstream_ids: upstreamIds,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["users", variables.id, "upstreams"] });
      toast.success(t("upstreamsUpdateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(`${t("upstreamsUpdateFailed")}: ${error.message}`);
    },
  });
}

/**
 * Assign ownership of an API key to a user.
 */
export function useAssignApiKeyOwner() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("users");

  return useMutation({
    mutationFn: ({ keyId, userId }: { keyId: string; userId: string }) =>
      apiClient.put<void>(`/admin/keys/${keyId}/owner`, { user_id: userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success(t("assignKeySuccess"));
    },
    onError: (error: Error) => {
      toast.error(`${t("assignKeyFailed")}: ${error.message}`);
    },
  });
}

/**
 * Revoke ownership of an API key, returning it to the unassigned pool.
 */
export function useRevokeApiKeyOwner() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("users");

  return useMutation({
    mutationFn: ({ keyId }: { keyId: string }) =>
      apiClient.delete<void>(`/admin/keys/${keyId}/owner`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success(t("revokeKeySuccess"));
    },
    onError: (error: Error) => {
      toast.error(`${t("revokeKeyFailed")}: ${error.message}`);
    },
  });
}
