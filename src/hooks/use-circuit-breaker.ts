"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CircuitBreakerDetailResponse } from "@/types/api";

const CIRCUIT_BREAKER_KEYS = {
  all: ["circuit-breakers"] as const,
  detail: (upstreamId: string) => [...CIRCUIT_BREAKER_KEYS.all, upstreamId] as const,
};

/**
 * Get circuit breaker status for a specific upstream
 */
export function useCircuitBreakerStatus(upstreamId: string, enabled: boolean = true) {
  return useQuery<CircuitBreakerDetailResponse>({
    queryKey: CIRCUIT_BREAKER_KEYS.detail(upstreamId),
    queryFn: async () => {
      const response = await fetch(`/api/admin/circuit-breakers/${upstreamId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch circuit breaker status");
      }
      const data = await response.json();
      return data.data;
    },
    enabled: enabled && !!upstreamId,
    refetchInterval: 5000, // Refetch every 5 seconds
  });
}

/**
 * Force circuit breaker to open or closed state
 */
export function useForceCircuitBreaker() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; message: string },
    Error,
    { upstreamId: string; action: "open" | "close" }
  >({
    mutationFn: async ({ upstreamId, action }) => {
      const endpoint =
        action === "open"
          ? `/api/admin/circuit-breakers/${upstreamId}/force-open`
          : `/api/admin/circuit-breakers/${upstreamId}/force-close`;

      const response = await fetch(endpoint, { method: "POST" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to force ${action} circuit breaker`);
      }
      return response.json();
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

      const response = await fetch(`/api/admin/circuit-breakers?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch circuit breaker list");
      }
      return response.json();
    },
    refetchInterval: 5000,
  });
}
