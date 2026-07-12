import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { UnresolvedModelsSection } from "@/components/admin/billing/unresolved-models-section";
import type { useBillingUnresolvedModels } from "@/hooks/use-billing";
import type { BillingManualOverride, BillingUnresolvedModel } from "@/types/api";

// UnresolvedModelsSection receives its `unresolved` query result as a prop, but the nested
// UnresolvedRepairTable calls useCreateBillingManualOverride / useDeleteBillingManualOverride /
// useBillingManualOverrides directly — those must be mocked at the module level.
const mockCreateMutateAsync = vi.fn();
const mockDeleteMutateAsync = vi.fn();
let mockCreateIsPending = false;
let mockDeleteIsPending = false;
let mockManualOverridesData: { items: BillingManualOverride[] } | undefined = { items: [] };

vi.mock("@/hooks/use-billing", () => ({
  useCreateBillingManualOverride: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: mockCreateIsPending,
  }),
  useDeleteBillingManualOverride: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: mockDeleteIsPending,
  }),
  useBillingManualOverrides: () => ({ data: mockManualOverridesData }),
}));

const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;
const tCommon = (key: string) => key;

function makeOverride(overrides: Partial<BillingManualOverride> = {}): BillingManualOverride {
  return {
    id: "override-1",
    model: "gpt-unresolved",
    input_price_per_million: 3,
    output_price_per_million: 9,
    cache_read_input_price_per_million: 0.6,
    cache_write_input_price_per_million: 1.2,
    note: "manual note",
    has_official_price: false,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeUnresolvedRow(
  overrides: Partial<BillingUnresolvedModel> = {}
): BillingUnresolvedModel {
  return {
    model: "gpt-unresolved",
    occurrences: 12,
    last_seen_at: "2024-01-05T00:00:00Z",
    last_upstream_id: "upstream-1",
    last_upstream_name: "Primary Upstream",
    has_manual_override: false,
    ...overrides,
  };
}

function makeUnresolvedQuery(
  overrides: Partial<ReturnType<typeof useBillingUnresolvedModels>> = {}
): ReturnType<typeof useBillingUnresolvedModels> {
  return {
    isLoading: false,
    isError: false,
    error: null,
    data: { items: [], total: 0 },
    ...overrides,
  } as unknown as ReturnType<typeof useBillingUnresolvedModels>;
}

describe("UnresolvedModelsSection", () => {
  beforeEach(() => {
    mockCreateMutateAsync.mockReset().mockResolvedValue(undefined);
    mockDeleteMutateAsync.mockReset().mockResolvedValue(undefined);
    mockCreateIsPending = false;
    mockDeleteIsPending = false;
    mockManualOverridesData = { items: [] };
  });

  describe("query states", () => {
    it("shows the loading indicator while the unresolved-models query is loading", () => {
      render(
        <UnresolvedModelsSection
          unresolved={makeUnresolvedQuery({ isLoading: true })}
          t={t}
          tCommon={tCommon}
        />
      );

      expect(screen.getByText("loading")).toBeInTheDocument();
      expect(screen.queryByText("manualEntryTitle")).not.toBeInTheDocument();
    });

    it("shows the query error message when the unresolved-models query fails", () => {
      render(
        <UnresolvedModelsSection
          unresolved={makeUnresolvedQuery({ isError: true, error: new Error("network down") })}
          t={t}
          tCommon={tCommon}
        />
      );

      expect(screen.getByText("Error: network down")).toBeInTheDocument();
    });

    it("shows the empty-state message when there are no unresolved rows", () => {
      render(
        <UnresolvedModelsSection unresolved={makeUnresolvedQuery()} t={t} tCommon={tCommon} />
      );

      expect(screen.getByText("unresolvedEmpty")).toBeInTheDocument();
      // The manual entry form is still rendered even when there are no unresolved rows.
      expect(screen.getByText("manualEntryTitle")).toBeInTheDocument();
    });
  });

  describe("manual entry form", () => {
    it("blocks the create call when the input price is missing or invalid", async () => {
      render(
        <UnresolvedModelsSection unresolved={makeUnresolvedQuery()} t={t} tCommon={tCommon} />
      );

      fireEvent.change(screen.getByPlaceholderText("overrideModelInput"), {
        target: { value: "custom-model" },
      });
      fireEvent.change(screen.getByPlaceholderText("overrideOutputPrice"), {
        target: { value: "9" },
      });
      // Input price left blank -> parseRequiredPrice("") is null -> save should be a no-op.
      fireEvent.click(screen.getByText("overrideSave"));

      expect(mockCreateMutateAsync).not.toHaveBeenCalled();
    });

    it("creates a manual override with the trimmed payload and fires onOverrideSaved", async () => {
      const onOverrideSaved = vi.fn();
      render(
        <UnresolvedModelsSection
          unresolved={makeUnresolvedQuery()}
          t={t}
          tCommon={tCommon}
          onOverrideSaved={onOverrideSaved}
        />
      );

      fireEvent.change(screen.getByPlaceholderText("overrideModelInput"), {
        target: { value: "  custom-model  " },
      });
      fireEvent.change(screen.getByPlaceholderText("overrideInputPrice"), {
        target: { value: "2" },
      });
      fireEvent.change(screen.getByPlaceholderText("overrideOutputPrice"), {
        target: { value: "8" },
      });
      fireEvent.change(screen.getByPlaceholderText("overrideNote"), {
        target: { value: "  seeded  " },
      });
      fireEvent.click(screen.getByText("overrideSave"));

      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        model: "custom-model",
        input_price_per_million: 2,
        output_price_per_million: 8,
        cache_read_input_price_per_million: null,
        cache_write_input_price_per_million: null,
        note: "seeded",
      });

      await waitFor(() => expect(onOverrideSaved).toHaveBeenCalledWith("custom-model"));
    });

    it("clears the manual draft fields after a successful save", async () => {
      render(
        <UnresolvedModelsSection unresolved={makeUnresolvedQuery()} t={t} tCommon={tCommon} />
      );

      const modelInput = screen.getByPlaceholderText("overrideModelInput") as HTMLInputElement;
      fireEvent.change(modelInput, { target: { value: "custom-model" } });
      fireEvent.change(screen.getByPlaceholderText("overrideInputPrice"), {
        target: { value: "2" },
      });
      fireEvent.change(screen.getByPlaceholderText("overrideOutputPrice"), {
        target: { value: "8" },
      });
      fireEvent.click(screen.getByText("overrideSave"));

      await waitFor(() => expect(modelInput.value).toBe(""));
    });

    it("switches to the update label and shows a delete button when the typed model already has a manual override", () => {
      mockManualOverridesData = { items: [makeOverride({ model: "existing-model" })] };
      render(
        <UnresolvedModelsSection unresolved={makeUnresolvedQuery()} t={t} tCommon={tCommon} />
      );

      fireEvent.change(screen.getByPlaceholderText("overrideModelInput"), {
        target: { value: "existing-model" },
      });

      expect(screen.getByText("overrideUpdate")).toBeInTheDocument();
      expect(screen.getByText("overrideDelete")).toBeInTheDocument();
    });

    it("calls delete with the existing override id from the manual-entry row", () => {
      const override = makeOverride({ id: "override-42", model: "existing-model" });
      mockManualOverridesData = { items: [override] };
      render(
        <UnresolvedModelsSection unresolved={makeUnresolvedQuery()} t={t} tCommon={tCommon} />
      );

      fireEvent.change(screen.getByPlaceholderText("overrideModelInput"), {
        target: { value: "existing-model" },
      });
      fireEvent.click(screen.getByText("overrideDelete"));

      expect(mockDeleteMutateAsync).toHaveBeenCalledWith("override-42");
    });

    it("disables the save button while a create mutation is pending", () => {
      mockCreateIsPending = true;
      render(
        <UnresolvedModelsSection unresolved={makeUnresolvedQuery()} t={t} tCommon={tCommon} />
      );

      expect(screen.getByText("overrideSave").closest("button")).toBeDisabled();
    });
  });

  describe("per-row repair", () => {
    it("shows the active badge and the last-upstream hint for rows with an existing override", () => {
      const rows = [makeUnresolvedRow({ model: "gpt-unresolved", last_upstream_name: "Primary" })];
      mockManualOverridesData = { items: [makeOverride({ model: "gpt-unresolved" })] };
      render(
        <UnresolvedModelsSection
          unresolved={makeUnresolvedQuery({ data: { items: rows, total: 1 } })}
          t={t}
          tCommon={tCommon}
        />
      );

      expect(screen.getByText("overrideActive")).toBeInTheDocument();
      expect(screen.getByText("12 hits · Primary")).toBeInTheDocument();
    });

    it("does not show the active badge for a row without an existing override", () => {
      const rows = [makeUnresolvedRow({ model: "gpt-unresolved" })];
      render(
        <UnresolvedModelsSection
          unresolved={makeUnresolvedQuery({ data: { items: rows, total: 1 } })}
          t={t}
          tCommon={tCommon}
        />
      );

      expect(screen.queryByText("overrideActive")).not.toBeInTheDocument();
      expect(screen.getAllByText("overrideSave").length).toBeGreaterThan(0);
    });

    it("pre-fills the per-row draft from the existing override and saves an update with the merged payload", async () => {
      const rows = [makeUnresolvedRow({ model: "gpt-unresolved" })];
      mockManualOverridesData = {
        items: [
          makeOverride({
            id: "override-9",
            model: "gpt-unresolved",
            input_price_per_million: 4,
            output_price_per_million: 10,
            note: "prior note",
          }),
        ],
      };
      render(
        <UnresolvedModelsSection
          unresolved={makeUnresolvedQuery({ data: { items: rows, total: 1 } })}
          t={t}
          tCommon={tCommon}
        />
      );

      // The row's own inputs (not the manual-entry form's) — there are two "Output Price"
      // placeholders on screen once a row is present, so scope to the row's save button.
      const rowSaveButton = screen.getByText("overrideUpdate");
      const outputInputs = screen.getAllByPlaceholderText("overrideOutputPrice");
      const rowOutputInput = outputInputs[outputInputs.length - 1];
      expect((rowOutputInput as HTMLInputElement).value).toBe("10");

      fireEvent.change(rowOutputInput, { target: { value: "20" } });
      fireEvent.click(rowSaveButton);

      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        model: "gpt-unresolved",
        input_price_per_million: 4,
        output_price_per_million: 20,
        cache_read_input_price_per_million: 0.6,
        cache_write_input_price_per_million: 1.2,
        note: "prior note",
      });
    });

    it("blocks the per-row save when the row's price becomes invalid", () => {
      const rows = [makeUnresolvedRow({ model: "gpt-unresolved" })];
      render(
        <UnresolvedModelsSection
          unresolved={makeUnresolvedQuery({ data: { items: rows, total: 1 } })}
          t={t}
          tCommon={tCommon}
        />
      );

      const inputPriceInputs = screen.getAllByPlaceholderText("overrideInputPrice");
      const rowInputPrice = inputPriceInputs[inputPriceInputs.length - 1];
      fireEvent.change(rowInputPrice, { target: { value: "-5" } });

      const outputInputs = screen.getAllByPlaceholderText("overrideOutputPrice");
      fireEvent.change(outputInputs[outputInputs.length - 1], { target: { value: "8" } });

      fireEvent.click(
        screen.getAllByText("overrideSave")[screen.getAllByText("overrideSave").length - 1]
      );

      expect(mockCreateMutateAsync).not.toHaveBeenCalled();
    });

    it("calls delete with the row's own override id", () => {
      const rows = [makeUnresolvedRow({ model: "gpt-unresolved" })];
      mockManualOverridesData = {
        items: [makeOverride({ id: "row-override-1", model: "gpt-unresolved" })],
      };
      render(
        <UnresolvedModelsSection
          unresolved={makeUnresolvedQuery({ data: { items: rows, total: 1 } })}
          t={t}
          tCommon={tCommon}
        />
      );

      fireEvent.click(screen.getByText("overrideDelete"));

      expect(mockDeleteMutateAsync).toHaveBeenCalledWith("row-override-1");
    });
  });
});
