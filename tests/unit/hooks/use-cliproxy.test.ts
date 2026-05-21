import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import type { CliproxyInstance } from "@/types/cliproxy";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    apiClient: {
      get: mockGet,
      post: mockPost,
      patch: mockPatch,
      delete: mockDelete,
    },
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number | null>) =>
    values?.message ? `${key}: ${values.message}` : key,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";
const mockToastSuccess = toast.success as ReturnType<typeof vi.fn>;
const mockToastError = toast.error as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

const sampleInstance: CliproxyInstance = {
  id: "instance-1",
  name: "local-dev",
  mode: "external",
  base_url: "http://localhost:8317",
  management_url: "http://localhost:8317",
  has_client_api_key: true,
  has_management_key: true,
  enabled: true,
  description: null,
  created_at: "2026-05-21T00:00:00Z",
  updated_at: "2026-05-21T00:00:00Z",
};

describe("use-cliproxy 实例 hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useCliproxyInstances 拉取并解包实例列表", async () => {
    mockGet.mockResolvedValueOnce({ data: [sampleInstance] });
    const { useCliproxyInstances } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCliproxyInstances(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/admin/cliproxy/instances");
    expect(result.current.data).toEqual([sampleInstance]);
  });

  it("useCreateCliproxyInstance 创建成功后提示并解包数据", async () => {
    mockPost.mockResolvedValueOnce({ data: sampleInstance });
    const { useCreateCliproxyInstance } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateCliproxyInstance(), { wrapper });
    const created = await result.current.mutateAsync({
      name: "local-dev",
      mode: "external",
      base_url: "http://localhost:8317",
      management_url: "http://localhost:8317",
      client_api_key: "key",
      management_key: "secret",
    });

    expect(created).toEqual(sampleInstance);
    expect(mockPost).toHaveBeenCalledWith(
      "/admin/cliproxy/instances",
      expect.objectContaining({ name: "local-dev", mode: "external" })
    );
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  });

  it("useCreateCliproxyInstance 失败时提示错误", async () => {
    mockPost.mockRejectedValueOnce(new Error("name conflict"));
    const { useCreateCliproxyInstance } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateCliproxyInstance(), { wrapper });
    await expect(
      result.current.mutateAsync({
        name: "dup",
        mode: "managed",
        base_url: "u",
        management_url: "u",
        client_api_key: "k",
        management_key: "m",
      })
    ).rejects.toThrow("name conflict");

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("instanceCreateFailed: name conflict")
    );
  });

  it("useUpdateCliproxyInstance 以 PATCH 更新实例", async () => {
    mockPatch.mockResolvedValueOnce({ data: sampleInstance });
    const { useUpdateCliproxyInstance } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateCliproxyInstance(), { wrapper });
    await result.current.mutateAsync({ id: "instance-1", data: { name: "renamed" } });

    expect(mockPatch).toHaveBeenCalledWith("/admin/cliproxy/instances/instance-1", {
      name: "renamed",
    });
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  });

  it("useDeleteCliproxyInstance 以 DELETE 删除实例", async () => {
    mockDelete.mockResolvedValueOnce({ data: { id: "instance-1" } });
    const { useDeleteCliproxyInstance } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteCliproxyInstance(), { wrapper });
    await result.current.mutateAsync("instance-1");

    expect(mockDelete).toHaveBeenCalledWith("/admin/cliproxy/instances/instance-1");
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  });

  it("useTestCliproxyConnection 调用预检测接口", async () => {
    mockPost.mockResolvedValueOnce({
      data: { status: "success", message: "ok", statusCode: 200 },
    });
    const { useTestCliproxyConnection } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useTestCliproxyConnection(), { wrapper });
    const res = await result.current.mutateAsync({
      management_url: "http://localhost:8317",
      management_key: "secret",
    });

    expect(mockPost).toHaveBeenCalledWith("/admin/cliproxy/instances/test", {
      management_url: "http://localhost:8317",
      management_key: "secret",
    });
    expect(res.status).toBe("success");
  });

  it("useTestCliproxyInstance 调用已保存实例检测接口", async () => {
    mockPost.mockResolvedValueOnce({
      data: { status: "auth_failed", message: "bad key", statusCode: 401 },
    });
    const { useTestCliproxyInstance } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useTestCliproxyInstance(), { wrapper });
    const res = await result.current.mutateAsync("instance-1");

    expect(mockPost).toHaveBeenCalledWith("/admin/cliproxy/instances/instance-1/test");
    expect(res.status).toBe("auth_failed");
  });
});

describe("use-cliproxy 账号 hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useCliproxyAuthAccounts 在实例 id 存在时拉取账号列表", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    const { useCliproxyAuthAccounts } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCliproxyAuthAccounts("instance-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/admin/cliproxy/instances/instance-1/auth-accounts");
  });

  it("useCliproxyAuthAccounts 在实例 id 为空时不发起请求", async () => {
    const { useCliproxyAuthAccounts } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    renderHook(() => useCliproxyAuthAccounts(null), { wrapper });

    expect(mockGet).not.toHaveBeenCalled();
  });

  it("useSyncCliproxyAuthAccounts 同步后提示并刷新", async () => {
    mockPost.mockResolvedValueOnce({
      data: { added: 1, updated: 2, removed: 0, total: 3 },
    });
    const { useSyncCliproxyAuthAccounts } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSyncCliproxyAuthAccounts(), { wrapper });
    await result.current.mutateAsync("instance-1");

    expect(mockPost).toHaveBeenCalledWith(
      "/admin/cliproxy/instances/instance-1/auth-accounts/sync"
    );
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  });

  it("useSetCliproxyAuthAccountStatus 以 PATCH 启停账号", async () => {
    mockPatch.mockResolvedValueOnce({ data: {} });
    const { useSetCliproxyAuthAccountStatus } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSetCliproxyAuthAccountStatus(), { wrapper });
    await result.current.mutateAsync({
      instanceId: "instance-1",
      accountName: "codex-a.json",
      disabled: true,
    });

    expect(mockPatch).toHaveBeenCalledWith(
      "/admin/cliproxy/instances/instance-1/auth-accounts/codex-a.json/status",
      { disabled: true }
    );
  });

  it("useUpdateCliproxyAuthAccountFields 以 PATCH 更新账号字段", async () => {
    mockPatch.mockResolvedValueOnce({ data: {} });
    const { useUpdateCliproxyAuthAccountFields } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateCliproxyAuthAccountFields(), { wrapper });
    await result.current.mutateAsync({
      instanceId: "instance-1",
      accountName: "codex-a.json",
      data: { prefix: "team-a", priority: 0, note: "" },
    });

    expect(mockPatch).toHaveBeenCalledWith(
      "/admin/cliproxy/instances/instance-1/auth-accounts/codex-a.json",
      { prefix: "team-a", priority: 0, note: "" }
    );
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  });
});

describe("use-cliproxy OAuth 登录 hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useInitiateCliproxyOAuthLogin 发起登录并返回授权地址", async () => {
    mockPost.mockResolvedValueOnce({
      data: { provider: "codex", url: "https://auth.example", state: "state-1" },
    });
    const { useInitiateCliproxyOAuthLogin } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useInitiateCliproxyOAuthLogin(), { wrapper });
    const res = await result.current.mutateAsync({
      instanceId: "instance-1",
      provider: "codex",
    });

    expect(mockPost).toHaveBeenCalledWith("/admin/cliproxy/instances/instance-1/oauth-login", {
      provider: "codex",
    });
    expect(res.state).toBe("state-1");
  });

  it("useCliproxyOAuthStatus 在 state 为空时不发起请求", async () => {
    const { useCliproxyOAuthStatus } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    renderHook(() => useCliproxyOAuthStatus("instance-1", null, true), { wrapper });

    expect(mockGet).not.toHaveBeenCalled();
  });

  it("useCliproxyOAuthStatus 启用时按 state 轮询登录状态", async () => {
    mockGet.mockResolvedValueOnce({ data: { status: "wait" } });
    const { useCliproxyOAuthStatus } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCliproxyOAuthStatus("instance-1", "state-1", true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      "/admin/cliproxy/instances/instance-1/oauth-login/status?state=state-1"
    );
  });
});

describe("use-cliproxy 上游创建 hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useCreateCliproxyPoolUpstream 按服务商创建池上游", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "upstream-1" } });
    const { useCreateCliproxyPoolUpstream } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateCliproxyPoolUpstream(), { wrapper });
    await result.current.mutateAsync({ instanceId: "instance-1", provider: "codex" });

    expect(mockPost).toHaveBeenCalledWith("/admin/cliproxy/instances/instance-1/pool-upstreams", {
      provider: "codex",
    });
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  });

  it("useCreateCliproxySingleAccountUpstream 创建单账号上游", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "upstream-2" } });
    const { useCreateCliproxySingleAccountUpstream } = await import("@/hooks/use-cliproxy");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateCliproxySingleAccountUpstream(), { wrapper });
    await result.current.mutateAsync({
      instanceId: "instance-1",
      accountName: "codex-a.json",
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/admin/cliproxy/instances/instance-1/auth-accounts/codex-a.json/upstream",
      {}
    );
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  });
});
