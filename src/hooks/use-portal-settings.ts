import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import type { PortalSettingsResponse, PortalSettingsUpdate } from "@/types/api";

/**
 * Read the member-portal settings singleton (admin surface).
 */
export function usePortalSettings() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["portal-settings"],
    queryFn: () => apiClient.get<PortalSettingsResponse>("/admin/portal-settings"),
  });
}

/**
 * Update the member-portal settings. Turning upstream exposure off realigns
 * every member key to its owner's granted set server-side, so the member key
 * lists are invalidated too.
 */
export function useUpdatePortalSettings() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("portalSettings");

  return useMutation({
    mutationFn: (data: PortalSettingsUpdate) =>
      apiClient.patch<PortalSettingsResponse>("/admin/portal-settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-settings"] });
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success(t("saved"));
    },
    onError: (error: Error) => {
      toast.error(`${t("saveFailed")}: ${error.message}`);
    },
  });
}
