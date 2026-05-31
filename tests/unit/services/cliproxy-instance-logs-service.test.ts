import { describe, it, expect, vi, beforeEach } from "vitest";

const getCliproxyInstanceRowMock = vi.fn();
const getLogsMock = vi.fn();

vi.mock("@/lib/services/cliproxy-instance-crud", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/cliproxy-instance-crud")>();
  return {
    ...actual,
    getCliproxyInstanceRow: (...args: unknown[]) => getCliproxyInstanceRowMock(...args),
    getDecryptedManagementKey: () => "mgmt-key",
  };
});

vi.mock("@/lib/services/cliproxy-management-client", () => ({
  getLogs: (...args: unknown[]) => getLogsMock(...args),
}));

const instanceRow = {
  id: "instance-1",
  managementUrl: "http://cliproxyapi:8317",
  managementKeyEncrypted: "enc(mgmt-key)",
};

describe("cliproxy-instance-logs-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listCliproxyInstanceLogs 透传 since 参数到管理客户端", async () => {
    const { listCliproxyInstanceLogs } =
      await import("@/lib/services/cliproxy-instance-logs-service");

    getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);
    getLogsMock.mockResolvedValueOnce([
      { timestamp: "2025-05-31T10:00:00Z", level: "info", message: "ok" },
    ]);

    const result = await listCliproxyInstanceLogs("instance-1", "2025-05-31T09:00:00Z");

    expect(result).toHaveLength(1);
    expect(getLogsMock).toHaveBeenCalledWith(
      { managementUrl: "http://cliproxyapi:8317", managementKey: "mgmt-key" },
      "2025-05-31T09:00:00Z"
    );
  });

  it("listCliproxyInstanceLogs 不传 since 时也不向客户端传递", async () => {
    const { listCliproxyInstanceLogs } =
      await import("@/lib/services/cliproxy-instance-logs-service");

    getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);
    getLogsMock.mockResolvedValueOnce([]);

    await listCliproxyInstanceLogs("instance-1");

    expect(getLogsMock).toHaveBeenCalledWith(
      { managementUrl: "http://cliproxyapi:8317", managementKey: "mgmt-key" },
      undefined
    );
  });

  it("listCliproxyInstanceLogs 实例不存在时抛出 CliproxyInstanceNotFoundError", async () => {
    const { listCliproxyInstanceLogs } =
      await import("@/lib/services/cliproxy-instance-logs-service");
    const { CliproxyInstanceNotFoundError } = await import("@/lib/services/cliproxy-instance-crud");

    getCliproxyInstanceRowMock.mockResolvedValueOnce(null);

    await expect(listCliproxyInstanceLogs("missing")).rejects.toBeInstanceOf(
      CliproxyInstanceNotFoundError
    );
    expect(getLogsMock).not.toHaveBeenCalled();
  });
});
