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

const sampleResult = {
  lines: ["2026-05-31 10:00:00 INFO server started"],
  line_count: 1,
  latest_timestamp: 1748685600,
};

describe("cliproxy-instance-logs-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listCliproxyInstanceLogs 透传 limit / after 查询参数到管理客户端", async () => {
    const { listCliproxyInstanceLogs } =
      await import("@/lib/services/cliproxy-instance-logs-service");

    resolveTargetMock.mockResolvedValueOnce(target);
    getLogsMock.mockResolvedValueOnce(sampleResult);

    const result = await listCliproxyInstanceLogs("instance-1", {
      limit: 200,
      after: 1748685000,
    });

    expect(result).toEqual(sampleResult);
    expect(getLogsMock).toHaveBeenCalledWith(target, { limit: 200, after: 1748685000 });
  });

  it("listCliproxyInstanceLogs 不传参数时默认传空对象", async () => {
    const { listCliproxyInstanceLogs } =
      await import("@/lib/services/cliproxy-instance-logs-service");

    resolveTargetMock.mockResolvedValueOnce(target);
    getLogsMock.mockResolvedValueOnce({ lines: [], line_count: 0, latest_timestamp: 0 });

    await listCliproxyInstanceLogs("instance-1");

    expect(getLogsMock).toHaveBeenCalledWith(target, {});
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
