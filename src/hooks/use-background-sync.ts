import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import type { BackgroundSyncTaskRunResponse, BackgroundSyncTasksResponse } from "@/types/api";

type BackgroundSyncTranslator = (
  key: string,
  values?: Record<string, string | number | null>
) => string;

function formatBackgroundSyncError(t: BackgroundSyncTranslator, key: string, error: Error): string {
  return t(key, { message: error.message });
}

export function useBackgroundSyncTasks() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["background-sync", "tasks"],
    queryFn: () => apiClient.get<BackgroundSyncTasksResponse>("/admin/background-sync/tasks"),
  });
}

export function useRunBackgroundSyncTask() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("backgroundSync") as BackgroundSyncTranslator;

  return useMutation({
    mutationFn: (taskName: string) =>
      apiClient.post<BackgroundSyncTaskRunResponse>(
        `/admin/background-sync/tasks/${encodeURIComponent(taskName)}/run`
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["background-sync", "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "model-prices"] });
      queryClient.invalidateQueries({ queryKey: ["upstreams"] });

      if (result.status === "running") {
        toast.message(t("runAlreadyRunning"));
        return;
      }
      if (result.status === "failed") {
        toast.error(t("runFailed"));
        return;
      }
      toast.success(t("runComplete"));
    },
    onError: (error: Error) => {
      toast.error(formatBackgroundSyncError(t, "runError", error));
    },
  });
}
