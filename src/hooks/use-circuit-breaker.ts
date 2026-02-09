"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CircuitBreakerDetailResponse } from "@/types/api";
import { useAuth } from "@/providers/auth-provider";

const CIRCUIT_BREAKER_KEYS = {
  all: ["circuit-breakers"] as const,
  detail: (upstreamId: string) => [...CIRCUIT_BREAKER_KEYS.all, upstreamId] as const,
};

/**
 * Get circuit breaker status for a specific upstream
 */
export function useCircuitBreakerStatus(upstreamId: string, enabled: boolean = true) {
  const { apiClient } = useAuth();
  return useQuery<CircuitBreakerDetailResponse>({
    queryKey: CIRCUIT_BREAKER_KEYS.detail(upstreamId),
    queryFn: async () => {
      const response = await apiClient.get<{ data: CircuitBreakerDetailResponse }>(
        `/admin/circuit-breakers/${upstreamId}`
      );
      return response.data;
    },
    enabled: enabled && !!upstreamId,
    refetchInterval: 5000, // Refetch every 5 seconds
  });
}

/**
 * Force circuit breaker to open or closed state
 */
export function useForceCircuitBreaker() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; message: string },
    Error,
    { upstreamId: string; action: "open" | "close" }
  >({
    mutationFn: ({ upstreamId, action }) => {
      const endpoint =
        action === "open"
          ? `/admin/circuit-breakers/${upstreamId}/force-open`
          : `/admin/circuit-breakers/${upstreamId}/force-close`;

      return apiClient.post<{ success: boolean; message: string }>(endpoint);
    },
    onSuccess: (_, { upstreamId }) => {
      // Invalidate circuit breaker status
      queryClient.invalidateQueries({
        queryKey: CIRCUIT_BREAKER_KEYS.detail(upstreamId),
      });
      // Also invalidate upstreams list since circuit_breaker status is embedded
      queryClient.invalidateQueries({ queryKey: ["upstreams"] });
    },
  });
}

/**
 * List all circuit breaker states with pagination
 */
export function useCircuitBreakerList({
  state,
  page = 1,
  pageSize = 20,
}: {
  state?: "closed" | "open" | "half_open" | null;
  page?: number;
  pageSize?: number;
}) {
  const { apiClient } = useAuth();
  return useQuery<{
    data: CircuitBreakerDetailResponse[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }>({
    queryKey: [...CIRCUIT_BREAKER_KEYS.all, { state, page, pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (state) params.append("state", state);
      params.append("page", page.toString());
      params.append("page_size", pageSize.toString());

      return apiClient.get<{
        data: CircuitBreakerDetailResponse[];
        pagination: {
          page: number;
          pageSize: number;
          total: number;
          totalPages: number;
        };
      }>(`/admin/circuit-breakers?${params.toString()}`);
    },
    refetchInterval: 5000,
  });
}
