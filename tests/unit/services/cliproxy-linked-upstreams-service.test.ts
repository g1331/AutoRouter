import { describe, it, expect, vi, beforeEach } from "vitest";

const dbSelectMock = vi.fn();
const getCliproxyInstanceByIdMock = vi.fn();

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((a, b) => ({ __op: "eq", a, b })),
    desc: vi.fn((c) => ({ __op: "desc", c })),
  };
});

vi.mock("@/lib/db", () => ({
  db: { select: (...args: unknown[]) => dbSelectMock(...args) },
  upstreams: { id: "id", cliproxyInstanceId: "cliproxyInstanceId", createdAt: "createdAt" },
}));

vi.mock("@/lib/services/cliproxy-instance-crud", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/cliproxy-instance-crud")>();
  return {
    ...actual,
    getCliproxyInstanceById: (...args: unknown[]) => getCliproxyInstanceByIdMock(...args),
  };
});

function makeSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "where", "orderBy"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

describe("cliproxy-linked-upstreams-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listCliproxyLinkedUpstreams 区分池上游与单账号上游", async () => {
    const { listCliproxyLinkedUpstreams } =
      await import("@/lib/services/cliproxy-linked-upstreams-service");

    getCliproxyInstanceByIdMock.mockResolvedValueOnce({ id: "instance-1" });
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([
        {
          id: "up-1",
          name: "Pool Codex",
          cliproxyProvider: "codex",
          cliproxyAuthFileName: null,
          isActive: true,
          createdAt: new Date("2025-01-01"),
        },
        {
          id: "up-2",
          name: "Single Claude",
          cliproxyProvider: "anthropic",
          cliproxyAuthFileName: "claude-a.json",
          isActive: false,
          createdAt: new Date("2025-01-02"),
        },
      ])
    );

    const result = await listCliproxyLinkedUpstreams("instance-1");

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "up-1", kind: "pool", authFileName: null });
    expect(result[1]).toMatchObject({
      id: "up-2",
      kind: "single",
      authFileName: "claude-a.json",
      isActive: false,
    });
  });

  it("listCliproxyLinkedUpstreams 无关联上游时返回空数组", async () => {
    const { listCliproxyLinkedUpstreams } =
      await import("@/lib/services/cliproxy-linked-upstreams-service");

    getCliproxyInstanceByIdMock.mockResolvedValueOnce({ id: "instance-1" });
    dbSelectMock.mockReturnValueOnce(makeSelectChain([]));

    const result = await listCliproxyLinkedUpstreams("instance-1");

    expect(result).toEqual([]);
  });

  it("listCliproxyLinkedUpstreams 实例不存在时抛出 CliproxyInstanceNotFoundError", async () => {
    const { listCliproxyLinkedUpstreams } =
      await import("@/lib/services/cliproxy-linked-upstreams-service");
    const { CliproxyInstanceNotFoundError } = await import("@/lib/services/cliproxy-instance-crud");

    getCliproxyInstanceByIdMock.mockResolvedValueOnce(null);

    await expect(listCliproxyLinkedUpstreams("missing")).rejects.toBeInstanceOf(
      CliproxyInstanceNotFoundError
    );
  });
});
