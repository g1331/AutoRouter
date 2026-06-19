import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type {
  PortalOverviewResponse,
  PortalUsageRange,
  PortalUsageResponse,
  User,
} from "@/types/api";

/**
 * Fetch a single user's account details (admin view).
 *
 * Backs the admin usage-detail page header. A missing user surfaces as a 404
 * ApiError on the query, so the page can render its "user not found" state;
 * retries are disabled so that not-found resolves immediately instead of
 * retrying three times.
 */
export function useAdminUser(userId: string | undefined, enabled: boolean = true) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["users", userId, "detail"],
    queryFn: () => apiClient.get<User>(`/admin/users/${userId}`),
    enabled: enabled && !!userId,
    retry: false,
  });
}

/**
 * Fetch a target user's overview aggregates (admin view).
 *
 * Admin counterpart to usePortalOverview: the response shape matches the
 * member-side /api/user/overview endpoint, so it reuses PortalOverviewResponse.
 */
export function useAdminUserOverview(userId: string | undefined, enabled: boolean = true) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["users", userId, "overview"],
    queryFn: () => apiClient.get<PortalOverviewResponse>(`/admin/users/${userId}/overview`),
    enabled: enabled && !!userId,
  });
}

/**
 * Fetch a target user's day-bucketed usage trend (admin view).
 *
 * Admin counterpart to usePortalUsage: the response shape matches the
 * member-side /api/user/usage endpoint, so it reuses PortalUsageResponse.
 */
export function useAdminUserUsage(
  userId: string | undefined,
  range: PortalUsageRange = "7d",
  enabled: boolean = true
) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["users", userId, "usage", range],
    queryFn: () =>
      apiClient.get<PortalUsageResponse>(`/admin/users/${userId}/usage?range=${range}`),
    enabled: enabled && !!userId,
  });
}
