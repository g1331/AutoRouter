import { describe, it, expect, vi, beforeEach } from "vitest";

const dbSelectMock = vi.fn();
const dbInsertMock = vi.fn();
const dbUpdateMock = vi.fn();
const dbDeleteMock = vi.fn();
const getCliproxyInstanceRowMock = vi.fn();
const listAuthFilesMock = vi.fn();
const getAuthFileModelsMock = vi.fn();
const patchAuthFileStatusMock = vi.fn();
const patchAuthFileFieldsMock = vi.fn();

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((a, b) => ({ __op: "eq", a, b })),
    and: vi.fn((...c) => ({ __op: "and", c })),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => dbSelectMock(...args),
    insert: (...args: unknown[]) => dbInsertMock(...args),
    update: (...args: unknown[]) => dbUpdateMock(...args),
    delete: (...args: unknown[]) => dbDeleteMock(...args),
  },
  cliproxyAuthAccounts: { id: "id", instanceId: "instanceId", authFileName: "authFileName" },
}));

vi.mock("@/lib/services/cliproxy-instance-crud", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/cliproxy-instance-crud")>();
  return {
    ...actual,
    getCliproxyInstanceRow: (...args: unknown[]) => getCliproxyInstanceRowMock(...args),
    getDecryptedManagementKey: () => "mgmt-key",
  };
});

vi.mock("@/lib/services/cliproxy-management-client", () => ({
  listAuthFiles: (...args: unknown[]) => listAuthFilesMock(...args),
  getAuthFileModels: (...args: unknown[]) => getAuthFileModelsMock(...args),
  patchAuthFileStatus: (...args: unknown[]) => patchAuthFileStatusMock(...args),
  patchAuthFileFields: (...args: unknown[]) => patchAuthFileFieldsMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

/** 构造可链式调用且可被 await 的 select 桩。 */
function makeSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "where", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

const instanceRow = {
  id: "instance-1",
  managementUrl: "http://cliproxyapi:8317",
  managementKeyEncrypted: "enc(mgmt-key)",
};

describe("cliproxy-auth-account-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncCliproxyAuthAccounts 新增 CLIProxyAPI 侧新账号", async () => {
    const { syncCliproxyAuthAccounts } =
      await import("@/lib/services/cliproxy-auth-account-service");

    getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);
    listAuthFilesMock.mockResolvedValueOnce([
      { name: "codex-a.json", provider: "codex", email: "a@x.com" },
    ]);
    dbSelectMock.mockReturnValueOnce(makeSelectChain([])); // listCliproxyAuthAccounts: 本地无账号
    getAuthFileModelsMock.mockResolvedValueOnce([{ id: "m1" }, { id: "m2" }]);
    const valuesMock = vi.fn().mockResolvedValueOnce(undefined);
    dbInsertMock.mockReturnValueOnce({ values: valuesMock });

    const result = await syncCliproxyAuthAccounts("instance-1");

    expect(result).toMatchObject({ added: 1, updated: 0, removed: 0, total: 1 });
    const inserted = valuesMock.mock.calls[0][0];
    expect(inserted.provider).toBe("codex");
    expect(inserted.modelCount).toBe(2);
  });

  it("syncCliproxyAuthAccounts 移除 CLIProxyAPI 侧已不存在的账号", async () => {
    const { syncCliproxyAuthAccounts } =
      await import("@/lib/services/cliproxy-auth-account-service");

    getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);
    listAuthFilesMock.mockResolvedValueOnce([]); // CLIProxyAPI 侧无账号
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([{ id: "acc-1", authFileName: "stale.json", instanceId: "instance-1" }])
    );
    const whereMock = vi.fn().mockResolvedValueOnce(undefined);
    dbDeleteMock.mockReturnValueOnce({ where: whereMock });

    const result = await syncCliproxyAuthAccounts("instance-1");

    expect(result).toMatchObject({ added: 0, updated: 0, removed: 1 });
    expect(dbDeleteMock).toHaveBeenCalled();
  });

  it("syncCliproxyAuthAccounts 单账号模型查询失败不中断同步", async () => {
    const { syncCliproxyAuthAccounts } =
      await import("@/lib/services/cliproxy-auth-account-service");

    getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);
    listAuthFilesMock.mockResolvedValueOnce([{ name: "codex-a.json", provider: "codex" }]);
    dbSelectMock.mockReturnValueOnce(makeSelectChain([]));
    getAuthFileModelsMock.mockRejectedValueOnce(new Error("model query failed"));
    const valuesMock = vi.fn().mockResolvedValueOnce(undefined);
    dbInsertMock.mockReturnValueOnce({ values: valuesMock });

    const result = await syncCliproxyAuthAccounts("instance-1");

    expect(result.added).toBe(1);
    expect(valuesMock.mock.calls[0][0].modelCount).toBe(0);
  });

  it("syncCliproxyAuthAccounts 实例不存在时抛错", async () => {
    const { syncCliproxyAuthAccounts } =
      await import("@/lib/services/cliproxy-auth-account-service");
    const { CliproxyInstanceNotFoundError } = await import("@/lib/services/cliproxy-instance-crud");

    getCliproxyInstanceRowMock.mockResolvedValueOnce(null);

    await expect(syncCliproxyAuthAccounts("missing")).rejects.toBeInstanceOf(
      CliproxyInstanceNotFoundError
    );
  });

  it("setCliproxyAuthAccountStatus 先调用 CLIProxyAPI 再更新缓存", async () => {
    const { setCliproxyAuthAccountStatus } =
      await import("@/lib/services/cliproxy-auth-account-service");

    getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([{ id: "acc-1", authFileName: "codex-a.json", disabled: false }])
    );
    patchAuthFileStatusMock.mockResolvedValueOnce(undefined);
    const returningMock = vi.fn().mockResolvedValueOnce([{ id: "acc-1", disabled: true }]);
    dbUpdateMock.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: returningMock }),
      }),
    });

    const row = await setCliproxyAuthAccountStatus("instance-1", "codex-a.json", true);

    expect(patchAuthFileStatusMock).toHaveBeenCalledWith(
      { managementUrl: "http://cliproxyapi:8317", managementKey: "mgmt-key" },
      "codex-a.json",
      true
    );
    expect(row.disabled).toBe(true);
  });

  it("setCliproxyAuthAccountStatus 账号不存在时抛错且不调用 CLIProxyAPI", async () => {
    const { setCliproxyAuthAccountStatus, CliproxyAuthAccountNotFoundError } =
      await import("@/lib/services/cliproxy-auth-account-service");

    getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);
    dbSelectMock.mockReturnValueOnce(makeSelectChain([]));

    await expect(
      setCliproxyAuthAccountStatus("instance-1", "missing.json", true)
    ).rejects.toBeInstanceOf(CliproxyAuthAccountNotFoundError);
    expect(patchAuthFileStatusMock).not.toHaveBeenCalled();
  });

  it("updateCliproxyAuthAccountFields 转发字段并更新缓存", async () => {
    const { updateCliproxyAuthAccountFields } =
      await import("@/lib/services/cliproxy-auth-account-service");

    getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([{ id: "acc-1", authFileName: "codex-a.json" }])
    );
    patchAuthFileFieldsMock.mockResolvedValueOnce(undefined);
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{ id: "acc-1", prefix: "team-a" }]),
      }),
    });
    dbUpdateMock.mockReturnValueOnce({ set: setMock });

    await updateCliproxyAuthAccountFields("instance-1", "codex-a.json", {
      prefix: "team-a",
      proxyUrl: "socks5://127.0.0.1:1080",
    });

    expect(patchAuthFileFieldsMock).toHaveBeenCalledWith(
      { managementUrl: "http://cliproxyapi:8317", managementKey: "mgmt-key" },
      {
        name: "codex-a.json",
        prefix: "team-a",
        proxy_url: "socks5://127.0.0.1:1080",
        priority: undefined,
        note: undefined,
      }
    );
    // proxy_url 不进入本地缓存。
    const cacheUpdate = setMock.mock.calls[0][0];
    expect(cacheUpdate).not.toHaveProperty("proxyUrl");
    expect(cacheUpdate.prefix).toBe("team-a");
  });
});
