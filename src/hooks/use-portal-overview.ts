import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type { PortalOverviewResponse, PortalUsageRange, PortalUsageResponse } from "@/types/api";

/**
 * Fetch the caller's personal overview aggregates (portal landing page).
 */
export function usePortalOverview() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["portal", "overview"],
    queryFn: () => apiClient.get<PortalOverviewResponse>("/user/overview"),
  });
}

/**
 * Fetch the caller's day-bucketed usage trend.
 */
export function usePortalUsage(range: PortalUsageRange = "7d") {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["portal", "usage", range],
    queryFn: () => apiClient.get<PortalUsageResponse>(`/user/usage?range=${range}`),
  });
}
