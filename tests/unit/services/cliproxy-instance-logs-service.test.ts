import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveTargetMock = vi.fn();
const getLogsMock = vi.fn();

vi.mock("@/lib/services/cliproxy-instance-crud", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/cliproxy-instance-crud")>();
  return {
    ...actual,
    resolveCliproxyManagementTarget: (...args: unknown[]) => resolveTargetMock(...args),
  };
});

vi.mock("@/lib/services/cliproxy-management-client", () => ({
  getLogs: (...args: unknown[]) => getLogsMock(...args),
}));

const target = {
  managementUrl: "http://cliproxyapi:8317",
  managementKey: "mgmt-key",
};

describe("cliproxy-instance-logs-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listCliproxyInstanceLogs 透传 since 参数到管理客户端", async () => {
    const { listCliproxyInstanceLogs } =
      await import("@/lib/services/cliproxy-instance-logs-service");

    resolveTargetMock.mockResolvedValueOnce(target);
    getLogsMock.mockResolvedValueOnce([
      { timestamp: "2025-05-31T10:00:00Z", level: "info", message: "ok" },
    ]);

    const result = await listCliproxyInstanceLogs("instance-1", "2025-05-31T09:00:00Z");

    expect(result).toHaveLength(1);
    expect(getLogsMock).toHaveBeenCalledWith(target, "2025-05-31T09:00:00Z");
  });

  it("listCliproxyInstanceLogs 不传 since 时也不向客户端传递", async () => {
    const { listCliproxyInstanceLogs } =
      await import("@/lib/services/cliproxy-instance-logs-service");

    resolveTargetMock.mockResolvedValueOnce(target);
    getLogsMock.mockResolvedValueOnce([]);

    await listCliproxyInstanceLogs("instance-1");

    expect(getLogsMock).toHaveBeenCalledWith(target, undefined);
  });

  it("listCliproxyInstanceLogs 实例不存在时抛出 CliproxyInstanceNotFoundError", async () => {
    const { listCliproxyInstanceLogs } =
      await import("@/lib/services/cliproxy-instance-logs-service");
    const { CliproxyInstanceNotFoundError } = await import("@/lib/services/cliproxy-instance-crud");

    resolveTargetMock.mockRejectedValueOnce(new CliproxyInstanceNotFoundError("missing"));

    await expect(listCliproxyInstanceLogs("missing")).rejects.toBeInstanceOf(
      CliproxyInstanceNotFoundError
    );
    expect(getLogsMock).not.toHaveBeenCalled();
  });
});
