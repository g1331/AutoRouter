import { describe, it, expect, vi, beforeEach } from "vitest";

const getCliproxyInstanceRowMock = vi.fn();
const getProviderAuthUrlMock = vi.fn();
const getAuthStatusMock = vi.fn();
const syncCliproxyAuthAccountsMock = vi.fn();

vi.mock("@/lib/services/cliproxy-instance-crud", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/cliproxy-instance-crud")>();
  return {
    ...actual,
    getCliproxyInstanceRow: (...args: unknown[]) => getCliproxyInstanceRowMock(...args),
    getDecryptedManagementKey: () => "mgmt-key",
  };
});

vi.mock("@/lib/services/cliproxy-management-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/cliproxy-management-client")>();
  return {
    ...actual,
    getProviderAuthUrl: (...args: unknown[]) => getProviderAuthUrlMock(...args),
    getAuthStatus: (...args: unknown[]) => getAuthStatusMock(...args),
  };
});

vi.mock("@/lib/services/cliproxy-auth-account-service", () => ({
  syncCliproxyAuthAccounts: (...args: unknown[]) => syncCliproxyAuthAccountsMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const instanceRow = {
  id: "instance-1",
  managementUrl: "http://cliproxyapi:8317",
  managementKeyEncrypted: "enc(mgmt-key)",
};

describe("cliproxy-oauth-login-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initiateCliproxyOAuthLogin 返回授权地址与会话标识", async () => {
    const { initiateCliproxyOAuthLogin } =
      await import("@/lib/services/cliproxy-oauth-login-service");

    getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);
    getProviderAuthUrlMock.mockResolvedValueOnce({
      url: "https://auth.example/x",
      state: "state-1",
    });

    const result = await initiateCliproxyOAuthLogin("instance-1", "codex");

    expect(result).toEqual({
      provider: "codex",
      url: "https://auth.example/x",
      state: "state-1",
    });
  });

  it("initiateCliproxyOAuthLogin 服务商非法时抛错", async () => {
    const { initiateCliproxyOAuthLogin, InvalidCliproxyOAuthProviderError } =
      await import("@/lib/services/cliproxy-oauth-login-service");

    await expect(
      initiateCliproxyOAuthLogin("instance-1", "unknown-provider")
    ).rejects.toBeInstanceOf(InvalidCliproxyOAuthProviderError);
    expect(getProviderAuthUrlMock).not.toHaveBeenCalled();
  });

  it("initiateCliproxyOAuthLogin 实例不存在时抛错", async () => {
    const { initiateCliproxyOAuthLogin } =
      await import("@/lib/services/cliproxy-oauth-login-service");
    const { CliproxyInstanceNotFoundError } = await import("@/lib/services/cliproxy-instance-crud");

    getCliproxyInstanceRowMock.mockResolvedValueOnce(null);

    await expect(initiateCliproxyOAuthLogin("missing", "codex")).rejects.toBeInstanceOf(
      CliproxyInstanceNotFoundError
    );
  });

  it("pollCliproxyOAuthStatus 进行中时返回 wait 且不触发同步", async () => {
    const { pollCliproxyOAuthStatus } = await import("@/lib/services/cliproxy-oauth-login-service");

    getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);
    getAuthStatusMock.mockResolvedValueOnce({ status: "wait" });

    const result = await pollCliproxyOAuthStatus("instance-1", "state-1");

    expect(result.status).toBe("wait");
    expect(syncCliproxyAuthAccountsMock).not.toHaveBeenCalled();
  });

  it("pollCliproxyOAuthStatus 成功时触发账号同步并返回同步结果", async () => {
    const { pollCliproxyOAuthStatus } = await import("@/lib/services/cliproxy-oauth-login-service");

    getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);
    getAuthStatusMock.mockResolvedValueOnce({ status: "ok" });
    syncCliproxyAuthAccountsMock.mockResolvedValueOnce({
      added: 1,
      updated: 0,
      removed: 0,
      total: 1,
    });

    const result = await pollCliproxyOAuthStatus("instance-1", "state-1");

    expect(result.status).toBe("ok");
    expect(result.syncResult).toMatchObject({ added: 1 });
    expect(syncCliproxyAuthAccountsMock).toHaveBeenCalledWith("instance-1");
  });

  it("pollCliproxyOAuthStatus 失败时返回错误信息", async () => {
    const { pollCliproxyOAuthStatus } = await import("@/lib/services/cliproxy-oauth-login-service");

    getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);
    getAuthStatusMock.mockResolvedValueOnce({ status: "error", error: "user denied" });

    const result = await pollCliproxyOAuthStatus("instance-1", "state-1");

    expect(result.status).toBe("error");
    expect(result.error).toBe("user denied");
    expect(syncCliproxyAuthAccountsMock).not.toHaveBeenCalled();
  });
});
