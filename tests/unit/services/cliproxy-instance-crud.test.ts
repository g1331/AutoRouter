import { describe, it, expect, vi, beforeEach } from "vitest";

const dbSelectMock = vi.fn();
const dbInsertMock = vi.fn();
const dbUpdateMock = vi.fn();
const dbDeleteMock = vi.fn();

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((a, b) => ({ __op: "eq", a, b })),
    desc: vi.fn((c) => ({ __op: "desc", c })),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => dbSelectMock(...args),
    insert: (...args: unknown[]) => dbInsertMock(...args),
    update: (...args: unknown[]) => dbUpdateMock(...args),
    delete: (...args: unknown[]) => dbDeleteMock(...args),
  },
  cliproxyInstances: {
    id: "id",
    name: "name",
    createdAt: "createdAt",
  },
  cliproxyAuthAccounts: {
    id: "id",
    instanceId: "instanceId",
  },
}));

vi.mock("@/lib/utils/encryption", () => ({
  encrypt: vi.fn((plaintext: string) => `enc(${plaintext})`),
  decrypt: vi.fn((token: string) => token.replace(/^enc\(/, "").replace(/\)$/, "")),
}));

vi.mock("@/lib/services/upstream-ssrf-validator", () => ({
  isUrlSafe: vi.fn((url: string) =>
    url.includes("169.254.169.254") || url.includes("10.0.0.")
      ? { safe: false, reason: "Private IP addresses are not allowed" }
      : { safe: true }
  ),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

/** 构造可链式调用且可被 await 的 select 桩。 */
function makeSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "where", "orderBy", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

const sampleRow = {
  id: "instance-1",
  name: "codex-pool",
  mode: "managed",
  baseUrl: "http://cliproxyapi:8317/v1",
  managementUrl: "http://cliproxyapi:8317",
  clientApiKeyEncrypted: "enc(client-key)",
  managementKeyEncrypted: "enc(mgmt-key)",
  enabled: true,
  description: null,
  createdAt: new Date("2026-05-20T00:00:00.000Z"),
  updatedAt: new Date("2026-05-20T00:00:00.000Z"),
};

describe("cliproxy-instance-crud", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createCliproxyInstance 加密凭据后入库，响应不含明文", async () => {
    const { createCliproxyInstance } = await import("@/lib/services/cliproxy-instance-crud");
    const { encrypt } = await import("@/lib/utils/encryption");

    dbSelectMock.mockReturnValueOnce(makeSelectChain([])); // 名称冲突检查
    const returningMock = vi.fn().mockResolvedValueOnce([sampleRow]);
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    dbInsertMock.mockReturnValueOnce({ values: valuesMock });

    const result = await createCliproxyInstance({
      name: "codex-pool",
      mode: "managed",
      baseUrl: "http://cliproxyapi:8317/v1",
      managementUrl: "http://cliproxyapi:8317",
      clientApiKey: "client-key",
      managementKey: "mgmt-key",
    });

    expect(encrypt).toHaveBeenCalledWith("client-key");
    expect(encrypt).toHaveBeenCalledWith("mgmt-key");
    const persisted = valuesMock.mock.calls[0][0];
    expect(persisted.clientApiKeyEncrypted).toBe("enc(client-key)");
    expect(persisted.managementKeyEncrypted).toBe("enc(mgmt-key)");
    expect(result).not.toHaveProperty("clientApiKeyEncrypted");
    expect(result).not.toHaveProperty("managementKeyEncrypted");
    expect(result).toMatchObject({ hasClientApiKey: true, hasManagementKey: true });
  });

  it("createCliproxyInstance 名称重复时抛出冲突错误", async () => {
    const { createCliproxyInstance, CliproxyInstanceNameConflictError } =
      await import("@/lib/services/cliproxy-instance-crud");

    dbSelectMock.mockReturnValueOnce(makeSelectChain([{ id: "existing" }]));

    await expect(
      createCliproxyInstance({
        name: "codex-pool",
        mode: "managed",
        baseUrl: "http://cliproxyapi:8317/v1",
        managementUrl: "http://cliproxyapi:8317",
        clientApiKey: "client-key",
        managementKey: "mgmt-key",
      })
    ).rejects.toBeInstanceOf(CliproxyInstanceNameConflictError);
  });

  it("受管模式允许内网地址", async () => {
    const { createCliproxyInstance } = await import("@/lib/services/cliproxy-instance-crud");

    dbSelectMock.mockReturnValueOnce(makeSelectChain([]));
    const returningMock = vi.fn().mockResolvedValueOnce([sampleRow]);
    dbInsertMock.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({ returning: returningMock }),
    });

    await expect(
      createCliproxyInstance({
        name: "codex-pool",
        mode: "managed",
        baseUrl: "http://10.0.0.5:8317/v1",
        managementUrl: "http://10.0.0.5:8317",
        clientApiKey: "client-key",
        managementKey: "mgmt-key",
      })
    ).resolves.toBeDefined();
  });

  it("外部模式拦截私有地址", async () => {
    const { createCliproxyInstance, InvalidCliproxyInstanceAddressError } =
      await import("@/lib/services/cliproxy-instance-crud");

    await expect(
      createCliproxyInstance({
        name: "codex-pool",
        mode: "external",
        baseUrl: "http://10.0.0.5:8317/v1",
        managementUrl: "http://10.0.0.5:8317",
        clientApiKey: "client-key",
        managementKey: "mgmt-key",
      })
    ).rejects.toBeInstanceOf(InvalidCliproxyInstanceAddressError);
  });

  it("拒绝非法地址格式", async () => {
    const { createCliproxyInstance, InvalidCliproxyInstanceAddressError } =
      await import("@/lib/services/cliproxy-instance-crud");

    await expect(
      createCliproxyInstance({
        name: "codex-pool",
        mode: "managed",
        baseUrl: "ftp://cliproxyapi:8317",
        managementUrl: "http://cliproxyapi:8317",
        clientApiKey: "client-key",
        managementKey: "mgmt-key",
      })
    ).rejects.toBeInstanceOf(InvalidCliproxyInstanceAddressError);
  });

  it("updateCliproxyInstance 未提交密钥时保留原值", async () => {
    const { updateCliproxyInstance } = await import("@/lib/services/cliproxy-instance-crud");

    dbSelectMock.mockReturnValueOnce(makeSelectChain([sampleRow])); // getCliproxyInstanceRow
    const returningMock = vi.fn().mockResolvedValueOnce([{ ...sampleRow, description: "updated" }]);
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: returningMock }),
    });
    dbUpdateMock.mockReturnValueOnce({ set: setMock });

    await updateCliproxyInstance("instance-1", { description: "updated" });

    const updateValues = setMock.mock.calls[0][0];
    expect(updateValues).not.toHaveProperty("clientApiKeyEncrypted");
    expect(updateValues).not.toHaveProperty("managementKeyEncrypted");
  });

  it("updateCliproxyInstance 实例不存在时抛错", async () => {
    const { updateCliproxyInstance, CliproxyInstanceNotFoundError } =
      await import("@/lib/services/cliproxy-instance-crud");

    dbSelectMock.mockReturnValueOnce(makeSelectChain([]));

    await expect(updateCliproxyInstance("missing", { description: "x" })).rejects.toBeInstanceOf(
      CliproxyInstanceNotFoundError
    );
  });

  it("deleteCliproxyInstance 实例不存在时抛错", async () => {
    const { deleteCliproxyInstance, CliproxyInstanceNotFoundError } =
      await import("@/lib/services/cliproxy-instance-crud");

    dbSelectMock.mockReturnValueOnce(makeSelectChain([]));

    await expect(deleteCliproxyInstance("missing")).rejects.toBeInstanceOf(
      CliproxyInstanceNotFoundError
    );
  });

  it("deleteCliproxyInstance 存在缓存账号时拒绝删除", async () => {
    const { deleteCliproxyInstance, CliproxyInstanceInUseError } =
      await import("@/lib/services/cliproxy-instance-crud");

    dbSelectMock.mockReturnValueOnce(makeSelectChain([sampleRow])); // getCliproxyInstanceRow
    dbSelectMock.mockReturnValueOnce(makeSelectChain([{ id: "account-1" }])); // 引用校验

    await expect(deleteCliproxyInstance("instance-1")).rejects.toBeInstanceOf(
      CliproxyInstanceInUseError
    );
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });

  it("deleteCliproxyInstance 无缓存账号时正常删除", async () => {
    const { deleteCliproxyInstance } = await import("@/lib/services/cliproxy-instance-crud");

    dbSelectMock.mockReturnValueOnce(makeSelectChain([sampleRow])); // getCliproxyInstanceRow
    dbSelectMock.mockReturnValueOnce(makeSelectChain([])); // 引用校验：无账号
    dbDeleteMock.mockReturnValueOnce({ where: vi.fn().mockResolvedValueOnce(undefined) });

    await expect(deleteCliproxyInstance("instance-1")).resolves.toBeUndefined();
    expect(dbDeleteMock).toHaveBeenCalled();
  });

  it("getDecryptedManagementKey 返回解密后的明文", async () => {
    const { getDecryptedManagementKey, getDecryptedClientApiKey } =
      await import("@/lib/services/cliproxy-instance-crud");

    expect(getDecryptedManagementKey(sampleRow)).toBe("mgmt-key");
    expect(getDecryptedClientApiKey(sampleRow)).toBe("client-key");
  });
});
