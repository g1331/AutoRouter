import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { SpendingRulesSection } from "@/components/admin/key/sections/spending-rules-section";
import { buildSpendingRulesPayload } from "@/components/admin/key/section-payloads";
import {
  KEY_ROLLING_DEFAULT_PERIOD_HOURS,
  apiKeySectionSchemas,
} from "@/components/admin/key/section-schemas";
import type { APIKeyResponse } from "@/types/api";

// next-intl: stable, predictable strings — "<namespace>.<key>" or with a JSON-encoded
// vars suffix, matching the idiom already used across this repo's component tests.
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${namespace}.${key}:${JSON.stringify(vars)}` : `${namespace}.${key}`,
}));

const { mockMutate } = vi.hoisted(() => ({ mockMutate: vi.fn() }));

vi.mock("@/hooks/use-api-keys", () => ({
  useUpdateApiKeySection: () => ({ mutate: mockMutate, isPending: false }),
}));

// Radix Select can't drive open/select interactions reliably under jsdom (no
// pointer-capture / scrollIntoView), so — matching the existing convention of
// stubbing out @/components/ui/select in this repo's dialog tests — this section's
// Select is replaced with a minimal, functional stand-in: SelectItem becomes a
// clickable option that calls the Select's onValueChange, and SelectValue echoes the
// current value so tests can assert on it without needing a real popover to open.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");

  interface SelectCtxValue {
    value?: string;
    onValueChange?: (value: string) => void;
  }
  const SelectCtx = React.createContext<SelectCtxValue>({});

  function Select({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    children?: React.ReactNode;
  }) {
    return React.createElement(SelectCtx.Provider, { value: { value, onValueChange } }, children);
  }
  function SelectTrigger({ children }: { children?: React.ReactNode }) {
    return React.createElement("div", null, children);
  }
  function SelectValue() {
    const ctx = React.useContext(SelectCtx);
    return React.createElement("span", { "data-testid": "select-current-value" }, ctx.value);
  }
  function SelectContent({ children }: { children?: React.ReactNode }) {
    return React.createElement("div", null, children);
  }
  function SelectItem({ value, children }: { value: string; children?: React.ReactNode }) {
    const ctx = React.useContext(SelectCtx);
    return React.createElement(
      "button",
      { type: "button", role: "option", onClick: () => ctx.onValueChange?.(value) },
      children
    );
  }

  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

function makeApiKey(overrides: Partial<APIKeyResponse> = {}): APIKeyResponse {
  return {
    id: "key-1",
    key_prefix: "sk-test",
    name: "Test Key",
    description: null,
    access_mode: "unrestricted",
    upstream_ids: [],
    allowed_models: null,
    spending_rules: [{ period_type: "daily", limit: 100 }],
    spending_rule_statuses: [],
    is_quota_exceeded: false,
    is_active: true,
    disabled_by_admin: false,
    expires_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function getRemoveButtons(): HTMLElement[] {
  return screen.queryAllByRole("button", { name: "keys.removeSpendingRule" });
}

describe("SpendingRulesSection", () => {
  beforeEach(() => {
    mockMutate.mockReset();
  });

  it("renders one row per existing spending rule from spendingRulesDefaults", () => {
    const apiKey = makeApiKey({
      spending_rules: [
        { period_type: "daily", limit: 100 },
        { period_type: "rolling", limit: 5, period_hours: 12 },
      ],
    });
    render(<SpendingRulesSection apiKey={apiKey} />);

    const currentValues = screen.getAllByTestId("select-current-value");
    expect(currentValues).toHaveLength(2);
    expect(currentValues[0]).toHaveTextContent("daily");
    expect(currentValues[1]).toHaveTextContent("rolling");

    const limitInputs = screen.getAllByLabelText("keys.quotaLimitUsd");
    expect(limitInputs[0]).toHaveValue(100);
    expect(limitInputs[1]).toHaveValue(5);

    // Only the rolling row shows period_hours.
    expect(screen.getAllByLabelText("keys.quotaPeriodHours")).toHaveLength(1);
    expect(screen.getByLabelText("keys.quotaPeriodHours")).toHaveValue(12);
  });

  it("shows the empty state and no rows when the key has no spending rules", () => {
    render(<SpendingRulesSection apiKey={makeApiKey({ spending_rules: null })} />);

    expect(screen.getByText("keys.spendingRulesEmpty")).toBeInTheDocument();
    expect(screen.queryByLabelText("keys.quotaLimitUsd")).not.toBeInTheDocument();
    expect(getRemoveButtons()).toHaveLength(0);
  });

  it("adding a rule appends a new daily row with limit 0", () => {
    render(<SpendingRulesSection apiKey={makeApiKey({ spending_rules: null })} />);

    fireEvent.click(screen.getByRole("button", { name: "keys.addSpendingRule" }));

    expect(screen.queryByText("keys.spendingRulesEmpty")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("select-current-value")).toHaveLength(1);
    expect(screen.getByTestId("select-current-value")).toHaveTextContent("daily");
    expect(screen.getByLabelText("keys.quotaLimitUsd")).toHaveValue(0);
    expect(getRemoveButtons()).toHaveLength(1);
  });

  it("removing a rule removes its row and restores the empty state", () => {
    render(<SpendingRulesSection apiKey={makeApiKey()} />);

    expect(getRemoveButtons()).toHaveLength(1);
    fireEvent.click(getRemoveButtons()[0]);

    expect(screen.queryByLabelText("keys.quotaLimitUsd")).not.toBeInTheDocument();
    expect(screen.getByText("keys.spendingRulesEmpty")).toBeInTheDocument();
  });

  it("selecting rolling defaults period_hours, and switching away then back re-defaults it (proving it was cleared)", () => {
    render(
      <SpendingRulesSection
        apiKey={makeApiKey({ spending_rules: [{ period_type: "daily", limit: 50 }] })}
      />
    );

    expect(screen.queryByLabelText("keys.quotaPeriodHours")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "keys.quotaPeriodType_rolling" }));
    expect(screen.getByLabelText("keys.quotaPeriodHours")).toHaveValue(
      KEY_ROLLING_DEFAULT_PERIOD_HOURS
    );

    // Overwrite with a custom value, then switch away — this should clear it to null,
    // not just hide the field while retaining the custom value underneath.
    fireEvent.change(screen.getByLabelText("keys.quotaPeriodHours"), { target: { value: "48" } });
    expect(screen.getByLabelText("keys.quotaPeriodHours")).toHaveValue(48);

    fireEvent.click(screen.getByRole("option", { name: "keys.quotaPeriodType_daily" }));
    expect(screen.queryByLabelText("keys.quotaPeriodHours")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "keys.quotaPeriodType_rolling" }));
    expect(screen.getByLabelText("keys.quotaPeriodHours")).toHaveValue(
      KEY_ROLLING_DEFAULT_PERIOD_HOURS
    );
  });

  it("blocks save and sets quotaLimitPositive when limit is cleared, without calling mutate", async () => {
    render(<SpendingRulesSection apiKey={makeApiKey()} />);

    fireEvent.change(screen.getByLabelText("keys.quotaLimitUsd"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(await screen.findByText("keys.quotaLimitPositive")).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("blocks save and sets quotaLimitPositive when limit is zero, without calling mutate", async () => {
    render(<SpendingRulesSection apiKey={makeApiKey()} />);

    fireEvent.change(screen.getByLabelText("keys.quotaLimitUsd"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(await screen.findByText("keys.quotaLimitPositive")).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("blocks save and sets quotaPeriodHoursRequired when a rolling rule's period_hours is cleared, without calling mutate", async () => {
    render(
      <SpendingRulesSection
        apiKey={makeApiKey({
          spending_rules: [{ period_type: "rolling", limit: 10, period_hours: 12 }],
        })}
      />
    );

    fireEvent.change(screen.getByLabelText("keys.quotaPeriodHours"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(await screen.findByText("keys.quotaPeriodHoursRequired")).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.queryByText("keys.quotaLimitPositive")).not.toBeInTheDocument();
  });

  it("calls mutate with the buildSpendingRulesPayload shape for a valid daily rule", async () => {
    render(<SpendingRulesSection apiKey={makeApiKey()} />);

    fireEvent.change(screen.getByLabelText("keys.quotaLimitUsd"), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    const expectedValues = apiKeySectionSchemas["spending-rules"].parse({
      spending_rules: [{ period_type: "daily", limit: 250, period_hours: null }],
    });

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { id: "key-1", payload: buildSpendingRulesPayload(expectedValues) },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
    });
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { spending_rules: [{ period_type: "daily", limit: 250 }] },
      }),
      expect.anything()
    );
  });

  it("calls mutate with period_hours included for a valid rolling rule", async () => {
    render(
      <SpendingRulesSection
        apiKey={makeApiKey({
          spending_rules: [{ period_type: "rolling", limit: 20, period_hours: 6 }],
        })}
      />
    );

    fireEvent.change(screen.getByLabelText("keys.quotaLimitUsd"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    const expectedValues = apiKeySectionSchemas["spending-rules"].parse({
      spending_rules: [{ period_type: "rolling", limit: 25, period_hours: 6 }],
    });

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { id: "key-1", payload: buildSpendingRulesPayload(expectedValues) },
        expect.anything()
      );
    });
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { spending_rules: [{ period_type: "rolling", limit: 25, period_hours: 6 }] },
      }),
      expect.anything()
    );
  });

  it("submits an explicit empty array (not omitted) when all rules are removed and saved", async () => {
    render(<SpendingRulesSection apiKey={makeApiKey()} />);

    fireEvent.click(getRemoveButtons()[0]);
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { id: "key-1", payload: { spending_rules: [] } },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
    });
    const [callArgs] = mockMutate.mock.calls[0];
    expect("spending_rules" in callArgs.payload).toBe(true);
  });
});
