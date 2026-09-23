import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveTargetMock = vi.fn();
const getAuthFilesSnapshotMock = vi.fn();
const requestProviderQuotaMock = vi.fn();

vi.mock("@/lib/services/cliproxy-instance-crud", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/cliproxy-instance-crud")>();
  return {
    ...actual,
    resolveCliproxyManagementTarget: (...args: unknown[]) => resolveTargetMock(...args),
  };
});
vi.mock("@/lib/services/cliproxy-management-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/cliproxy-management-client")>();
  return {
    ...actual,
    getAuthFilesSnapshot: (...args: unknown[]) => getAuthFilesSnapshotMock(...args),
    requestProviderQuota: (...args: unknown[]) => requestProviderQuotaMock(...args),
  };
});

describe("cliproxy-provider-quota-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveTargetMock.mockResolvedValue({
      managementUrl: "http://cliproxy",
      managementKey: "secret",
    });
  });

  it("将 Codex 已用百分比换算为剩余值并只输出安全字段", async () => {
    const { getCliproxyProviderQuota } =
      await import("@/lib/services/cliproxy-provider-quota-service");
    getAuthFilesSnapshotMock.mockResolvedValue({
      files: [
        {
          name: "codex-a.json",
          type: "codex",
          auth_index: "index-a",
          chatgpt_account_id: "acct_123",
          access_token: "private-token",
        },
      ],
    });
    requestProviderQuotaMock.mockResolvedValue({
      status_code: 200,
      body: JSON.stringify({
        rate_limit: {
          primary_window: { used_percent: 25.5, reset_at: 1_797_979_200 },
          secondary_window: { used_percent: 100, reset_after_seconds: 600 },
        },
        access_token: "private-token",
      }),
    });
    const result = await getCliproxyProviderQuota("instance-1", "codex-a.json");
    expect(requestProviderQuotaMock).toHaveBeenCalledWith(
      { managementUrl: "http://cliproxy", managementKey: "secret" },
      "codex",
      "index-a",
      "acct_123"
    );
    expect(result.status).toBe("ready");
    expect(result.windows).toEqual([
      { id: "primary", remaining_percent: 74.5, resets_at: "2026-12-22T22:40:00.000Z" },
      { id: "secondary", remaining_percent: 0, resets_at: expect.any(String) },
    ]);
    expect(JSON.stringify(result)).not.toContain("private-token");
    expect(JSON.stringify(result)).not.toContain("acct_123");
  });

  it("解析 Claude 窗口，未知值不伪装成满额", async () => {
    const { projectProviderQuota } = await import("@/lib/services/cliproxy-provider-quota-service");
    const result = projectProviderQuota(
      "anthropic",
      JSON.stringify({
        five_hour: { utilization: 0, resets_at: "2026-09-24T00:00:00Z" },
        seven_day: { utilization: "" },
        seven_day_sonnet: { utilization: 83.2 },
      }),
      new Date("2026-09-23T00:00:00Z")
    );
    expect(result.windows).toEqual([
      { id: "five-hour", remaining_percent: 100, resets_at: "2026-09-24T00:00:00.000Z" },
      { id: "seven-day", remaining_percent: null, resets_at: null },
      { id: "seven-day-sonnet", remaining_percent: 16.8, resets_at: null },
    ]);
  });

  it("不支持、停用和缺索引时不调用供应商", async () => {
    const { getCliproxyProviderQuota } =
      await import("@/lib/services/cliproxy-provider-quota-service");
    for (const [file, expected] of [
      [{ name: "gemini.json", type: "gemini", auth_index: "g" }, "unsupported"],
      [{ name: "codex-gemini.json", type: "gemini", auth_index: "g" }, "unsupported"],
      [{ name: "claude.json", type: "claude", auth_index: "c", disabled: true }, "unavailable"],
      [
        { name: "claude-unavailable.json", type: "claude", auth_index: "c", unavailable: true },
        "unavailable",
      ],
      [{ name: "codex.json", type: "codex" }, "unavailable"],
    ] as const) {
      getAuthFilesSnapshotMock.mockResolvedValueOnce({ files: [file] });
      expect((await getCliproxyProviderQuota("instance-1", file.name)).status).toBe(expected);
    }
    expect(requestProviderQuotaMock).not.toHaveBeenCalled();
  });

  it("供应商错误与无效响应不当作额度返回", async () => {
    const { getCliproxyProviderQuota, projectProviderQuota } =
      await import("@/lib/services/cliproxy-provider-quota-service");
    getAuthFilesSnapshotMock.mockResolvedValue({
      files: [{ name: "codex.json", type: "codex", auth_index: "c" }],
    });
    requestProviderQuotaMock.mockResolvedValueOnce({ status_code: 401, body: "private-token" });
    await expect(getCliproxyProviderQuota("instance-1", "codex.json")).rejects.toThrow("HTTP 401");
    expect(() => projectProviderQuota("codex", "not-json")).toThrow("不是有效 JSON");
  });

  it("管理端异常不向 API 透出供应商原始响应", async () => {
    const { getCliproxyProviderQuota } =
      await import("@/lib/services/cliproxy-provider-quota-service");
    const { CliproxyManagementApiError } =
      await import("@/lib/services/cliproxy-management-client");
    getAuthFilesSnapshotMock.mockResolvedValue({
      files: [{ name: "codex.json", type: "codex", auth_index: "c" }],
    });
    requestProviderQuotaMock.mockRejectedValueOnce(
      new CliproxyManagementApiError("service_error", "raw private-token", 502)
    );
    await expect(getCliproxyProviderQuota("instance-1", "codex.json")).rejects.toThrow(
      "供应商额度查询失败，请检查 CLIProxyAPI 管理端连接"
    );
  });
});
