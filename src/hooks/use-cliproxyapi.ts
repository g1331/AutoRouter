import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import type {
  CliproxyApiAccount,
  CliproxyApiConnectionConfig,
  CliproxyApiConnectionTestResult,
  CliproxyApiConnectionUpsertRequest,
  CliproxyApiEndpointKind,
  CliproxyApiModel,
  CliproxyApiOauthLoginResponse,
  CliproxyApiProvider,
  CliproxyApiUpstreamPreset,
  UpstreamModelRule,
} from "@/types/api";

interface CliproxyApiConfigResponse {
  items: CliproxyApiConnectionConfig[];
  default_connection: CliproxyApiConnectionConfig | null;
}

interface CliproxyApiStatusResponse {
  connection: CliproxyApiConnectionConfig;
}

interface CliproxyApiStatusTestResponse {
  result: CliproxyApiConnectionTestResult;
  connection: CliproxyApiConnectionConfig;
}

interface CliproxyApiListResponse<T> {
  items: T[];
}

type CliproxyApiAccountPreset = CliproxyApiUpstreamPreset & {
  model_rules: UpstreamModelRule[];
};

function connectionQuery(connectionId?: string | null): string {
  const params = new URLSearchParams();
  // Most CPA routes accept an omitted connection id as "use the default connection".
  if (connectionId) params.set("connection_id", connectionId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Fetch configured CLIProxyAPI connections.
 */
export function useCliproxyApiConfig() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["cliproxyapi", "config"],
    queryFn: () => apiClient.get<CliproxyApiConfigResponse>("/admin/cliproxyapi/config"),
  });
}

/**
 * Save a CLIProxyAPI connection configuration.
 */
export function useSaveCliproxyApiConfig() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CliproxyApiConnectionUpsertRequest & { id?: string }) =>
      apiClient.post<CliproxyApiConnectionConfig>("/admin/cliproxyapi/config", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliproxyapi"] });
      toast.success("CLIProxyAPI 配置已保存");
    },
    onError: (error: Error) => {
      toast.error(`保存 CLIProxyAPI 配置失败: ${error.message}`);
    },
  });
}

/**
 * Test one CLIProxyAPI endpoint for a selected connection.
 */
export function useTestCliproxyApiConnection() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { connection_id?: string | null; endpoint: CliproxyApiEndpointKind }) =>
      apiClient.post<CliproxyApiStatusTestResponse>("/admin/cliproxyapi/status", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliproxyapi"] });
      toast.success("CLIProxyAPI 连接测试完成");
    },
    onError: (error: Error) => {
      toast.error(`CLIProxyAPI 连接测试失败: ${error.message}`);
    },
  });
}

/**
 * Fetch CLIProxyAPI account files.
 */
export function useCliproxyApiAccounts(
  connectionId?: string | null,
  options: { enabled?: boolean } = {}
) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["cliproxyapi", "auth-files", connectionId ?? "default"],
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiClient.get<CliproxyApiListResponse<CliproxyApiAccount>>(
        `/admin/cliproxyapi/auth-files${connectionQuery(connectionId)}`
      ),
  });
}

/**
 * Update a CLIProxyAPI auth file status or editable fields.
 */
export function useUpdateCliproxyApiAccount() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      connection_id?: string | null;
      name: string;
      disabled?: boolean;
      fields?: {
        prefix?: string | null;
        proxy_url?: string | null;
        headers?: Record<string, string> | null;
        priority?: number | null;
        note?: string | null;
      };
    }) => apiClient.patch<{ status: "ok" }>("/admin/cliproxyapi/auth-files", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliproxyapi", "auth-files"] });
      toast.success("CLIProxyAPI 账号已更新");
    },
    onError: (error: Error) => {
      toast.error(`更新 CLIProxyAPI 账号失败: ${error.message}`);
    },
  });
}

/**
 * Fetch model names for one CLIProxyAPI auth file.
 */
export function useCliproxyApiAccountModels(
  connectionId: string | null,
  accountName: string | null,
  options: { enabled?: boolean } = {}
) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["cliproxyapi", "auth-files", "models", connectionId ?? "default", accountName],
    enabled: Boolean(accountName) && (options.enabled ?? true),
    queryFn: () => {
      const params = new URLSearchParams({ name: accountName ?? "" });
      if (connectionId) params.set("connection_id", connectionId);
      return apiClient.get<CliproxyApiListResponse<CliproxyApiModel>>(
        `/admin/cliproxyapi/auth-files/models?${params.toString()}`
      );
    },
  });
}

/**
 * Fetch OAuth pool upstream presets for one CLIProxyAPI connection.
 */
export function useCliproxyApiUpstreamPresets(
  connectionId?: string | null,
  options: { enabled?: boolean } = {}
) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["cliproxyapi", "presets", connectionId ?? "default"],
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiClient.get<CliproxyApiListResponse<CliproxyApiUpstreamPreset>>(
        `/admin/cliproxyapi/presets${connectionQuery(connectionId)}`
      ),
  });
}

/**
 * Build a fixed-account upstream preset from one CLIProxyAPI account.
 */
export function useBuildCliproxyApiAccountPreset() {
  const { apiClient } = useAuth();

  return useMutation({
    mutationFn: (data: {
      connection_id?: string | null;
      provider: CliproxyApiProvider;
      account_name: string;
      account_prefix?: string | null;
      models: string[];
    }) => apiClient.post<CliproxyApiAccountPreset>("/admin/cliproxyapi/presets", data),
  });
}

/**
 * Start an OAuth login and return the provider authorization URL.
 */
export function useStartCliproxyApiOauth() {
  const { apiClient } = useAuth();

  return useMutation({
    mutationFn: (data: {
      connection_id?: string | null;
      provider: CliproxyApiProvider;
      is_webui?: boolean;
      project_id?: string | null;
    }) => {
      const params = new URLSearchParams({ provider: data.provider });
      if (data.connection_id) params.set("connection_id", data.connection_id);
      if (data.is_webui) params.set("is_webui", "true");
      if (data.project_id) params.set("project_id", data.project_id);
      return apiClient.get<CliproxyApiOauthLoginResponse>(
        `/admin/cliproxyapi/oauth?${params.toString()}`
      );
    },
  });
}

/**
 * Poll an OAuth state previously returned by CLIProxyAPI.
 */
export function usePollCliproxyApiOauth(connectionId: string | null, state: string | null) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["cliproxyapi", "oauth", connectionId ?? "default", state],
    enabled: Boolean(state),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // OAuth polling stops itself once CPA reports a terminal state.
      return status === "pending" ? 3000 : false;
    },
    queryFn: () => {
      const params = new URLSearchParams({ state: state ?? "" });
      if (connectionId) params.set("connection_id", connectionId);
      return apiClient.get<CliproxyApiOauthLoginResponse>(
        `/admin/cliproxyapi/oauth?${params.toString()}`
      );
    },
  });
}

/**
 * Fetch the selected or default connection status snapshot.
 */
export function useCliproxyApiStatus(
  connectionId?: string | null,
  options: { enabled?: boolean } = {}
) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["cliproxyapi", "status", connectionId ?? "default"],
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiClient.get<CliproxyApiStatusResponse>(
        `/admin/cliproxyapi/status${connectionQuery(connectionId)}`
      ),
  });
}
