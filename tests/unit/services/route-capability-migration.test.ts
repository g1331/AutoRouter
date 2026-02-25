import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const findMany = vi.fn();
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const eq = vi.fn(() => "eq-condition");
  const logInfo = vi.fn();
  const logWarn = vi.fn();

  return {
    findMany,
    where,
    set,
    update,
    eq,
    logInfo,
    logWarn,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreams: {
        findMany: mocks.findMany,
      },
    },
    update: mocks.update,
  },
  upstreams: {
    id: "id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: mocks.eq,
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    info: mocks.logInfo,
    warn: mocks.logWarn,
  }),
}));

describe("route-capability-migration", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.findMany.mockReset();
    mocks.where.mockReset();
    mocks.set.mockReset();
    mocks.update.mockReset();
    mocks.eq.mockReset();
    mocks.logInfo.mockReset();
    mocks.logWarn.mockReset();

    mocks.where.mockResolvedValue(undefined);
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.eq.mockReturnValue("eq-condition");
  });

  it("retries migration after transient query failure and only marks completed on success", async () => {
    mocks.findMany
      .mockRejectedValueOnce(new Error("temporary database failure"))
      .mockResolvedValueOnce([
        {
          id: "upstream-1",
          name: "primary-upstream",
          routeCapabilities: null,
          updatedAt: new Date(),
        },
      ]);

    const { ensureRouteCapabilityMigration } =
      await import("@/lib/services/route-capability-migration");

    await expect(ensureRouteCapabilityMigration()).resolves.toBeUndefined();
    await expect(ensureRouteCapabilityMigration()).resolves.toBeUndefined();
    await expect(ensureRouteCapabilityMigration()).resolves.toBeUndefined();

    expect(mocks.findMany).toHaveBeenCalledTimes(2);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("normalizes persisted non-null route capabilities and writes back canonical values", async () => {
    mocks.findMany.mockResolvedValueOnce([
      {
        id: "upstream-2",
        name: "dirty-upstream",
        routeCapabilities: [
          " openai_chat_compatible ",
          "unknown_capability",
          "openai_chat_compatible",
        ],
        updatedAt: new Date(),
      },
    ]);

    const { ensureRouteCapabilityMigration } =
      await import("@/lib/services/route-capability-migration");

    await expect(ensureRouteCapabilityMigration()).resolves.toBeUndefined();

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        routeCapabilities: ["openai_chat_compatible"],
      })
    );
  });

  it("reorders same-length capability arrays and updates when item order is not canonical", async () => {
    mocks.findMany.mockResolvedValueOnce([
      {
        id: "upstream-3",
        name: "reordered-upstream",
        routeCapabilities: ["openai_extended", "openai_chat_compatible"],
        updatedAt: new Date(),
      },
    ]);

    const { ensureRouteCapabilityMigration } =
      await import("@/lib/services/route-capability-migration");

    await expect(ensureRouteCapabilityMigration()).resolves.toBeUndefined();

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        routeCapabilities: ["openai_chat_compatible", "openai_extended"],
      })
    );
  });

  it("does not write when persisted capabilities are already normalized", async () => {
    mocks.findMany.mockResolvedValueOnce([
      {
        id: "upstream-4",
        name: "clean-upstream",
        routeCapabilities: ["openai_chat_compatible"],
        updatedAt: new Date(),
      },
    ]);

    const { ensureRouteCapabilityMigration } =
      await import("@/lib/services/route-capability-migration");

    await expect(ensureRouteCapabilityMigration()).resolves.toBeUndefined();
    await expect(ensureRouteCapabilityMigration()).resolves.toBeUndefined();

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
  });

  it("retries after update failure and logs warning", async () => {
    mocks.findMany
      .mockResolvedValueOnce([
        {
          id: "upstream-5",
          name: "flaky-upstream",
          routeCapabilities: [" openai_chat_compatible "],
          updatedAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "upstream-5",
          name: "flaky-upstream",
          routeCapabilities: [" openai_chat_compatible "],
          updatedAt: new Date(),
        },
      ]);
    mocks.where.mockRejectedValueOnce(new Error("update failed"));

    const { ensureRouteCapabilityMigration } =
      await import("@/lib/services/route-capability-migration");

    await expect(ensureRouteCapabilityMigration()).resolves.toBeUndefined();
    await expect(ensureRouteCapabilityMigration()).resolves.toBeUndefined();

    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.logWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        upstreamId: "upstream-5",
        upstreamName: "flaky-upstream",
      }),
      "skip route capability migration due to update failure"
    );
  });

  it("waits for in-flight migration instead of starting duplicate queries", async () => {
    let resolveFindMany: ((value: Array<Record<string, unknown>>) => void) | null = null;
    const delayedFindMany = new Promise<Array<Record<string, unknown>>>((resolve) => {
      resolveFindMany = resolve;
    });
    mocks.findMany.mockReturnValueOnce(delayedFindMany);

    const { ensureRouteCapabilityMigration } =
      await import("@/lib/services/route-capability-migration");

    const first = ensureRouteCapabilityMigration();
    const second = ensureRouteCapabilityMigration();

    resolveFindMany?.([
      {
        id: "upstream-6",
        name: "inflight-upstream",
        routeCapabilities: null,
        updatedAt: new Date(),
      },
    ]);

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
  });
});
