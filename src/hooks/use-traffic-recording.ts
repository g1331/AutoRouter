import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import type {
  PaginatedTrafficRecordingsResponse,
  TrafficRecordingDetailResponse,
  TrafficRecordingResponse,
  TrafficRecordingSettingsResponse,
  TrafficRecordingSettingsUpdate,
} from "@/types/api";

export interface TrafficRecordingFilters {
  api_key_id?: string;
  upstream_id?: string;
  status_code?: number;
  model?: string;
  start_time?: string;
  end_time?: string;
}

type TrafficRecordingTranslator = (
  key: string,
  values?: Record<string, string | number | null>
) => string;

export function useTrafficRecordingSettings() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["traffic-recording", "settings"],
    queryFn: () =>
      apiClient.get<TrafficRecordingSettingsResponse>("/admin/traffic-recording/settings"),
  });
}

export function useUpdateTrafficRecordingSettings() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("trafficRecording") as TrafficRecordingTranslator;

  return useMutation({
    mutationFn: (data: TrafficRecordingSettingsUpdate) =>
      apiClient.patch<TrafficRecordingSettingsResponse>("/admin/traffic-recording/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["traffic-recording"] });
      toast.success(t("settingsSaved"));
    },
    onError: (error: Error) => {
      toast.error(t("settingsSaveFailed", { message: error.message }));
    },
  });
}

export function useTrafficRecordings(
  page = 1,
  pageSize = 20,
  filters: TrafficRecordingFilters = {}
) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["traffic-recording", "recordings", page, pageSize, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (filters.api_key_id?.trim()) params.set("api_key_id", filters.api_key_id.trim());
      if (filters.upstream_id?.trim()) params.set("upstream_id", filters.upstream_id.trim());
      if (filters.status_code !== undefined) params.set("status_code", String(filters.status_code));
      if (filters.model?.trim()) params.set("model", filters.model.trim());
      if (filters.start_time) params.set("start_time", filters.start_time);
      if (filters.end_time) params.set("end_time", filters.end_time);
      return apiClient.get<PaginatedTrafficRecordingsResponse>(
        `/admin/traffic-recordings?${params.toString()}`
      );
    },
  });
}

export function useTrafficRecordingDetail(id: string | null) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["traffic-recording", "detail", id],
    queryFn: () =>
      apiClient.get<TrafficRecordingDetailResponse>(
        `/admin/traffic-recordings/${encodeURIComponent(id ?? "")}`
      ),
    enabled: Boolean(id),
  });
}

export type TrafficRecordingByLogIdStatus =
  | "idle"
  | "loading"
  | "absent"
  | "present"
  | "missing-file"
  | "error";

export interface TrafficRecordingByLogIdResult {
  status: TrafficRecordingByLogIdStatus;
  summary: TrafficRecordingResponse | null;
  detail: TrafficRecordingDetailResponse | null;
  error: Error | null;
}

/**
 * Probe whether a request log has an associated traffic recording, and
 * fetch its fixture detail on hit. Both queries stay disabled until the
 * caller opts in (typically when the log row is expanded).
 */
export function useTrafficRecordingByLogId(
  logId: string | null | undefined,
  enabled: boolean
): TrafficRecordingByLogIdResult {
  const { apiClient } = useAuth();
  const trimmedLogId = logId?.trim() ?? "";
  const probeEnabled = enabled && trimmedLogId.length > 0;

  const probe = useQuery({
    queryKey: ["traffic-recording", "by-log", trimmedLogId],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("request_log_id", trimmedLogId);
      params.set("page_size", "1");
      return apiClient.get<PaginatedTrafficRecordingsResponse>(
        `/admin/traffic-recordings?${params.toString()}`
      );
    },
    enabled: probeEnabled,
  });

  const summary = probe.data?.items[0] ?? null;
  const detailQuery = useQuery({
    queryKey: ["traffic-recording", "detail", summary?.id ?? null],
    queryFn: () =>
      apiClient.get<TrafficRecordingDetailResponse>(
        `/admin/traffic-recordings/${encodeURIComponent(summary?.id ?? "")}`
      ),
    enabled: probeEnabled && Boolean(summary?.id),
  });

  if (!probeEnabled) {
    return { status: "idle", summary: null, detail: null, error: null };
  }

  if (probe.isLoading) {
    return { status: "loading", summary: null, detail: null, error: null };
  }

  if (probe.isError) {
    return {
      status: "error",
      summary: null,
      detail: null,
      error: probe.error instanceof Error ? probe.error : new Error(String(probe.error)),
    };
  }

  if (!summary) {
    return { status: "absent", summary: null, detail: null, error: null };
  }

  if (detailQuery.isLoading) {
    return { status: "loading", summary, detail: null, error: null };
  }

  if (detailQuery.isError) {
    const detailError =
      detailQuery.error instanceof Error ? detailQuery.error : new Error(String(detailQuery.error));
    const message = detailError.message ?? "";
    const isMissingFile = /missing|enoent|not.*found|文件/i.test(message);
    return {
      status: isMissingFile ? "missing-file" : "error",
      summary,
      detail: null,
      error: detailError,
    };
  }

  return {
    status: "present",
    summary,
    detail: detailQuery.data ?? null,
    error: null,
  };
}

export function useDeleteTrafficRecording() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("trafficRecording") as TrafficRecordingTranslator;

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<{ deleted: boolean }>(`/admin/traffic-recordings/${encodeURIComponent(id)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["traffic-recording"] });
      toast.success(t("recordDeleted"));
    },
    onError: (error: Error) => {
      toast.error(t("recordDeleteFailed", { message: error.message }));
    },
  });
}

export function useCleanupTrafficRecordings() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("trafficRecording") as TrafficRecordingTranslator;

  return useMutation({
    mutationFn: () =>
      apiClient.post<{
        deleted_count: number;
        failure_count: number;
        error_summary: string | null;
      }>("/admin/traffic-recordings/cleanup"),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["traffic-recording"] });
      queryClient.invalidateQueries({ queryKey: ["background-sync", "tasks"] });
      toast.success(t("cleanupComplete", { count: result.deleted_count }));
    },
    onError: (error: Error) => {
      toast.error(t("cleanupFailed", { message: error.message }));
    },
  });
}
