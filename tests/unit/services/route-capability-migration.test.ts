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
});
