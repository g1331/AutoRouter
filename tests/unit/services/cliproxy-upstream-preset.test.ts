import { describe, it, expect, vi, beforeEach } from "vitest";

const dbUpdateMock = vi.fn();
const getCliproxyInstanceRowMock = vi.fn();
const getCliproxyAuthAccountMock = vi.fn();
const updateCliproxyAuthAccountFieldsMock = vi.fn();
const createUpstreamMock = vi.fn();

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((a, b) => ({ __op: "eq", a, b })),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    update: (...args: unknown[]) => dbUpdateMock(...args),
  },
  upstreams: { id: "id" },
}));

vi.mock("@/lib/services/cliproxy-instance-crud", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/cliproxy-instance-crud")>();
  return {
    ...actual,
    getCliproxyInstanceRow: (...args: unknown[]) => getCliproxyInstanceRowMock(...args),
    getDecryptedClientApiKey: () => "client-key",
  };
});

vi.mock("@/lib/services/cliproxy-auth-account-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/cliproxy-auth-account-service")>();
  return {
    ...actual,
    getCliproxyAuthAccount: (...args: unknown[]) => getCliproxyAuthAccountMock(...args),
    updateCliproxyAuthAccountFields: (...args: unknown[]) =>
      updateCliproxyAuthAccountFieldsMock(...args),
  };
});

vi.mock("@/lib/services/upstream-crud", () => ({
  createUpstream: (...args: unknown[]) => createUpstreamMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const instanceRow = {
  id: "instance-1",
  name: "Prod CPA",
  baseUrl: "http://cliproxyapi:8317",
  clientApiKeyEncrypted: "enc(client-key)",
};

describe("cliproxy-upstream-preset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbUpdateMock.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });
    createUpstreamMock.mockResolvedValue({ id: "upstream-1" });
  });

  describe("buildCliproxyPrefixedModel", () => {
    it("将前缀拼接到模型名前", async () => {
      const { buildCliproxyPrefixedModel } =
        await import("@/lib/services/cliproxy-upstream-preset");
      expect(buildCliproxyPrefixedModel("team-a", "gpt-4")).toBe("team-a/gpt-4");
    });

    it("模型名已含该前缀时跳过拼接", async () => {
      const { buildCliproxyPrefixedModel } =
        await import("@/lib/services/cliproxy-upstream-preset");
      expect(buildCliproxyPrefixedModel("team-a", "team-a/gpt-4")).toBe("team-a/gpt-4");
    });

    it("前缀含斜杠时抛出非法前缀错误", async () => {
      const { buildCliproxyPrefixedModel, InvalidCliproxyPrefixError } =
        await import("@/lib/services/cliproxy-upstream-preset");
      expect(() => buildCliproxyPrefixedModel("team/a", "gpt-4")).toThrow(
        InvalidCliproxyPrefixError
      );
    });
  });

  describe("normalizeCliproxyPrefix", () => {
    it("去除首尾空白与斜杠", async () => {
      const { normalizeCliproxyPrefix } = await import("@/lib/services/cliproxy-upstream-preset");
      expect(normalizeCliproxyPrefix("  /team-a/  ")).toBe("team-a");
    });

    it("归一化后为空时抛错", async () => {
      const { normalizeCliproxyPrefix, InvalidCliproxyPrefixError } =
        await import("@/lib/services/cliproxy-upstream-preset");
      expect(() => normalizeCliproxyPrefix("///")).toThrow(InvalidCliproxyPrefixError);
    });
  });

  describe("resolveCliproxyAccountPrefix", () => {
    it("账号存在且有前缀时返回归一化前缀", async () => {
      const { resolveCliproxyAccountPrefix } =
        await import("@/lib/services/cliproxy-upstream-preset");
      getCliproxyAuthAccountMock.mockResolvedValueOnce({
        id: "acc-1",
        authFileName: "codex-a.json",
        provider: "codex",
        prefix: "  /team-a/  ",
      });

      await expect(resolveCliproxyAccountPrefix("instance-1", "codex-a.json")).resolves.toBe(
        "team-a"
      );
    });

    it("账号不存在时返回 null", async () => {
      const { resolveCliproxyAccountPrefix } =
        await import("@/lib/services/cliproxy-upstream-preset");
      getCliproxyAuthAccountMock.mockResolvedValueOnce(null);

      await expect(resolveCliproxyAccountPrefix("instance-1", "missing.json")).resolves.toBeNull();
    });

    it("账号无前缀时返回 null", async () => {
      const { resolveCliproxyAccountPrefix } =
        await import("@/lib/services/cliproxy-upstream-preset");
      getCliproxyAuthAccountMock.mockResolvedValueOnce({
        id: "acc-1",
        authFileName: "codex-a.json",
        provider: "codex",
        prefix: null,
      });

      await expect(resolveCliproxyAccountPrefix("instance-1", "codex-a.json")).resolves.toBeNull();
    });

    it("前缀取值非法时返回 null 而非抛错", async () => {
      const { resolveCliproxyAccountPrefix } =
        await import("@/lib/services/cliproxy-upstream-preset");
      getCliproxyAuthAccountMock.mockResolvedValueOnce({
        id: "acc-1",
        authFileName: "codex-a.json",
        provider: "codex",
        prefix: "///",
      });

      await expect(resolveCliproxyAccountPrefix("instance-1", "codex-a.json")).resolves.toBeNull();
    });
  });

  describe("createCliproxyPoolUpstream", () => {
    it("创建 Codex 池上游：拼接 /v1 路径并预设能力", async () => {
      const { createCliproxyPoolUpstream } =
        await import("@/lib/services/cliproxy-upstream-preset");
      getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);

      const result = await createCliproxyPoolUpstream("instance-1", "codex");

      expect(result).toEqual({ id: "upstream-1" });
      const input = createUpstreamMock.mock.calls[0][0];
      expect(input.baseUrl).toBe("http://cliproxyapi:8317/v1");
      expect(input.apiKey).toBe("client-key");
      expect(input.routeCapabilities).toEqual(["codex_cli_responses", "openai_responses"]);
      // 回填实例与服务商关联字段。
      const backfill = dbUpdateMock.mock.results[0].value.set.mock.calls[0][0];
      expect(backfill).toMatchObject({
        cliproxyInstanceId: "instance-1",
        cliproxyProvider: "codex",
      });
      expect(backfill).not.toHaveProperty("cliproxyAuthFileName");
    });

    it("创建 Claude 池上游：拼接 Anthropic 路径", async () => {
      const { createCliproxyPoolUpstream } =
        await import("@/lib/services/cliproxy-upstream-preset");
      getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);

      await createCliproxyPoolUpstream("instance-1", "anthropic");

      const input = createUpstreamMock.mock.calls[0][0];
      expect(input.baseUrl).toBe("http://cliproxyapi:8317/api/provider/anthropic/v1");
      expect(input.routeCapabilities).toEqual(["claude_code_messages", "anthropic_messages"]);
    });

    it("创建 Gemini 池上游：拼接 Google 路径", async () => {
      const { createCliproxyPoolUpstream } =
        await import("@/lib/services/cliproxy-upstream-preset");
      getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);

      await createCliproxyPoolUpstream("instance-1", "gemini");

      const input = createUpstreamMock.mock.calls[0][0];
      expect(input.baseUrl).toBe("http://cliproxyapi:8317/api/provider/google");
      expect(input.routeCapabilities).toEqual(["gemini_native_generate"]);
    });

    it("非法服务商时抛出 InvalidCliproxyOAuthProviderError", async () => {
      const { createCliproxyPoolUpstream } =
        await import("@/lib/services/cliproxy-upstream-preset");
      const { InvalidCliproxyOAuthProviderError } =
        await import("@/lib/services/cliproxy-oauth-login-service");

      await expect(createCliproxyPoolUpstream("instance-1", "vertex")).rejects.toBeInstanceOf(
        InvalidCliproxyOAuthProviderError
      );
      expect(createUpstreamMock).not.toHaveBeenCalled();
    });

    it("实例不存在时抛出 CliproxyInstanceNotFoundError", async () => {
      const { createCliproxyPoolUpstream } =
        await import("@/lib/services/cliproxy-upstream-preset");
      const { CliproxyInstanceNotFoundError } =
        await import("@/lib/services/cliproxy-instance-crud");
      getCliproxyInstanceRowMock.mockResolvedValueOnce(null);

      await expect(createCliproxyPoolUpstream("missing", "codex")).rejects.toBeInstanceOf(
        CliproxyInstanceNotFoundError
      );
      expect(createUpstreamMock).not.toHaveBeenCalled();
    });
  });

  describe("createCliproxySingleAccountUpstream", () => {
    it("账号已有前缀时沿用且不写入 CLIProxyAPI", async () => {
      const { createCliproxySingleAccountUpstream } =
        await import("@/lib/services/cliproxy-upstream-preset");
      getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);
      getCliproxyAuthAccountMock.mockResolvedValueOnce({
        id: "acc-1",
        authFileName: "codex-a.json",
        provider: "codex",
        prefix: "team-a",
      });

      await createCliproxySingleAccountUpstream("instance-1", "codex-a.json");

      expect(updateCliproxyAuthAccountFieldsMock).not.toHaveBeenCalled();
      const backfill = dbUpdateMock.mock.results[0].value.set.mock.calls[0][0];
      expect(backfill).toMatchObject({
        cliproxyInstanceId: "instance-1",
        cliproxyProvider: "codex",
        cliproxyAuthFileName: "codex-a.json",
      });
    });

    it("账号无前缀时生成前缀并写入 CLIProxyAPI", async () => {
      const { createCliproxySingleAccountUpstream } =
        await import("@/lib/services/cliproxy-upstream-preset");
      getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);
      getCliproxyAuthAccountMock.mockResolvedValueOnce({
        id: "acc-1",
        authFileName: "codex-a.json",
        provider: "codex",
        prefix: null,
      });

      await createCliproxySingleAccountUpstream("instance-1", "codex-a.json");

      expect(updateCliproxyAuthAccountFieldsMock).toHaveBeenCalledWith(
        "instance-1",
        "codex-a.json",
        { prefix: "codex-a" }
      );
    });

    it("账号不存在时抛出 CliproxyAuthAccountNotFoundError", async () => {
      const { createCliproxySingleAccountUpstream } =
        await import("@/lib/services/cliproxy-upstream-preset");
      const { CliproxyAuthAccountNotFoundError } =
        await import("@/lib/services/cliproxy-auth-account-service");
      getCliproxyInstanceRowMock.mockResolvedValueOnce(instanceRow);
      getCliproxyAuthAccountMock.mockResolvedValueOnce(null);

      await expect(
        createCliproxySingleAccountUpstream("instance-1", "missing.json")
      ).rejects.toBeInstanceOf(CliproxyAuthAccountNotFoundError);
      expect(createUpstreamMock).not.toHaveBeenCalled();
    });
  });
});
