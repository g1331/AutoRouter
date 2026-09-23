import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveTargetMock = vi.fn();
const getAuthFilesSnapshotMock = vi.fn();

vi.mock("@/lib/services/cliproxy-instance-crud", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/cliproxy-instance-crud")>();
  return {
    ...actual,
    resolveCliproxyManagementTarget: (...args: unknown[]) => resolveTargetMock(...args),
  };
});
vi.mock("@/lib/services/cliproxy-management-client", () => ({
  getAuthFilesSnapshot: (...args: unknown[]) => getAuthFilesSnapshotMock(...args),
}));

describe("cliproxy-account-usage-service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("只投影账号计数、近期分桶和安全的配额信号，保留真实零值", async () => {
    const { toCliproxyAccountUsageSnapshot } =
      await import("@/lib/services/cliproxy-account-usage-service");
    const result = toCliproxyAccountUsageSnapshot(
      {
        observed_at: "2026-09-23T02:00:00Z",
        files: [
          {
            name: "codex-a.json",
            success: 0,
            failed: 2,
            recent_requests: [{ time: "10:00-10:10", success: 0, failed: 1 }],
            quota: {
              observed_at: "2026-09-23T01:59:00Z",
              signals: {
                "X-Codex-Primary-Used-Percent": "25",
                "X-Codex-Primary-Reset-After-Seconds": "600",
                Authorization: "Bearer private",
              },
            },
            model_quotas: {
              "gpt-6": {
                observed_at: "2026-09-23T01:58:00Z",
                signals: { "X-Codex-Primary-Used-Percent": "75" },
              },
            },
            path: "/private/auth.json",
            token: "private",
          },
        ],
      },
      "2026-09-23T02:01:00Z"
    );

    expect(result).toEqual({
      fetched_at: "2026-09-23T02:01:00Z",
      observed_at: "2026-09-23T02:00:00Z",
      accounts: [
        {
          auth_file_name: "codex-a.json",
          success: 0,
          failed: 2,
          recent_requests: [{ time: "10:00-10:10", success: 0, failed: 1 }],
          quota: {
            observed_at: "2026-09-23T01:59:00Z",
            signals: {
              "X-Codex-Primary-Used-Percent": "25",
              "X-Codex-Primary-Reset-After-Seconds": "600",
            },
          },
          model_quotas: {
            "gpt-6": {
              observed_at: "2026-09-23T01:58:00Z",
              signals: { "X-Codex-Primary-Used-Percent": "75" },
            },
          },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("磁盘回退响应的缺失字段保持未知，非法统计不伪装为零", async () => {
    const { toCliproxyAccountUsageSnapshot } =
      await import("@/lib/services/cliproxy-account-usage-service");
    const result = toCliproxyAccountUsageSnapshot(
      {
        files: [
          { name: "disk.json" },
          { name: "bad.json", success: -1, failed: "0", recent_requests: [{ time: "bad" }] },
        ],
      },
      "2026-09-23T02:01:00Z"
    );
    expect(result.observed_at).toBeNull();
    expect(result.accounts).toEqual([
      {
        auth_file_name: "disk.json",
        success: null,
        failed: null,
        recent_requests: null,
        quota: null,
        model_quotas: null,
      },
      {
        auth_file_name: "bad.json",
        success: null,
        failed: null,
        recent_requests: [],
        quota: null,
        model_quotas: null,
      },
    ]);
  });

  it("仅解析一次实例目标并发出一次只读快照请求", async () => {
    const { getCliproxyAccountUsage } =
      await import("@/lib/services/cliproxy-account-usage-service");
    const target = { managementUrl: "http://cliproxyapi:8317", managementKey: "redacted" };
    resolveTargetMock.mockResolvedValueOnce(target);
    getAuthFilesSnapshotMock.mockResolvedValueOnce({ files: [] });
    const result = await getCliproxyAccountUsage("instance-1");
    expect(resolveTargetMock).toHaveBeenCalledWith("instance-1");
    expect(getAuthFilesSnapshotMock).toHaveBeenCalledWith(target);
    expect(result.accounts).toEqual([]);
  });
});
