import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type { CompensationRule, CompensationRuleCreate, CompensationRuleUpdate } from "@/types/api";
import { toast } from "sonner";

interface CompensationRulesListResponse {
  data: CompensationRule[];
}

interface CompensationRuleResponse {
  data: CompensationRule;
}

export function useCompensationRules() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["compensation-rules"],
    queryFn: () =>
      apiClient.get<CompensationRulesListResponse>("/admin/compensation-rules").then((r) => r.data),
  });
}

export function useCreateCompensationRule() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CompensationRuleCreate) =>
      apiClient
        .post<CompensationRuleResponse>("/admin/compensation-rules", data)
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["compensation-rules"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useUpdateCompensationRule() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CompensationRuleUpdate }) =>
      apiClient
        .put<CompensationRuleResponse>(`/admin/compensation-rules/${id}`, data)
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["compensation-rules"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useDeleteCompensationRule() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete<null>(`/admin/compensation-rules/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["compensation-rules"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
