import { describe, it, expect, vi, beforeEach } from "vitest";

const dbInsertMock = vi.fn();
const dbUpdateMock = vi.fn();
const dbDeleteMock = vi.fn();

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((a, b) => ({ __op: "eq", a, b })),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => dbInsertMock(...args),
    update: (...args: unknown[]) => dbUpdateMock(...args),
    delete: (...args: unknown[]) => dbDeleteMock(...args),
  },
  billingManualPriceOverrides: {
    id: "id",
    model: "model",
  },
}));

describe("billing-price-service (manual override CRUD)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createBillingManualPriceOverride trims model and returns record", async () => {
    const { createBillingManualPriceOverride } =
      await import("@/lib/services/billing-price-service");

    const returningMock = vi.fn().mockResolvedValueOnce([
      {
        id: "override-1",
        model: "sample_spec",
        inputPricePerMillion: 1,
        outputPricePerMillion: 2,
        cacheReadInputPricePerMillion: null,
        cacheWriteInputPricePerMillion: 0.5,
        note: null,
        createdAt: new Date("2026-02-28T00:00:00.000Z"),
        updatedAt: new Date("2026-02-28T00:00:00.000Z"),
      },
    ]);
    const onConflictMock = vi.fn().mockReturnValue({ returning: returningMock });
    const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock });
    dbInsertMock.mockReturnValueOnce({ values: valuesMock });

    const result = await createBillingManualPriceOverride({
      model: "  sample_spec  ",
      inputPricePerMillion: 1,
      outputPricePerMillion: 2,
      cacheWriteInputPricePerMillion: 0.5,
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "sample_spec",
        cacheReadInputPricePerMillion: null,
        cacheWriteInputPricePerMillion: 0.5,
        note: null,
      })
    );
    expect(result).toMatchObject({
      id: "override-1",
      model: "sample_spec",
      inputPricePerMillion: 1,
      outputPricePerMillion: 2,
      cacheWriteInputPricePerMillion: 0.5,
    });
  });

  it("updateBillingManualPriceOverride updates provided fields and returns null when missing", async () => {
    const { updateBillingManualPriceOverride } =
      await import("@/lib/services/billing-price-service");

    const returningMock = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "override-1",
          model: "sample_spec",
          inputPricePerMillion: 1,
          outputPricePerMillion: 2,
          cacheReadInputPricePerMillion: 0.1,
          cacheWriteInputPricePerMillion: 0.2,
          note: "note",
          createdAt: new Date("2026-02-28T00:00:00.000Z"),
          updatedAt: new Date("2026-02-28T00:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    dbUpdateMock.mockReturnValue({ set: setMock });

    const updated = await updateBillingManualPriceOverride("override-1", {
      inputPricePerMillion: 1,
      outputPricePerMillion: 2,
      cacheReadInputPricePerMillion: 0.1,
      cacheWriteInputPricePerMillion: 0.2,
      note: "note",
    });

    expect(updated).not.toBeNull();
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPricePerMillion: 1,
        outputPricePerMillion: 2,
        cacheReadInputPricePerMillion: 0.1,
        cacheWriteInputPricePerMillion: 0.2,
        note: "note",
        updatedAt: expect.any(Date),
      })
    );

    const missing = await updateBillingManualPriceOverride("missing", { note: "x" });
    expect(missing).toBeNull();
  });

  it("deleteBillingManualPriceOverride returns true when rows deleted", async () => {
    const { deleteBillingManualPriceOverride } =
      await import("@/lib/services/billing-price-service");

    const returningMock = vi.fn().mockResolvedValueOnce([{ id: "override-1" }]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    dbDeleteMock.mockReturnValueOnce({ where: whereMock });

    const ok = await deleteBillingManualPriceOverride("override-1");
    expect(ok).toBe(true);
  });
});
