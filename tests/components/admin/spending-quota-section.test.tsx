import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SpendingQuotaSection } from "@/components/admin/upstream/sections/spending-quota-section";
import { buildSpendingQuotaPayload } from "@/components/admin/upstream/section-payloads";
import {
  ROLLING_DEFAULT_PERIOD_HOURS,
  upstreamSectionSchemas,
} from "@/components/admin/upstream/section-schemas";
import type { Upstream } from "@/types/api";

/**
 * Behavior tests for SpendingQuotaSection (Phase B2 upstream detail page).
 * Covers: add/remove a spending rule via the field array, the "rolling"
 * period_type revealing period_hours defaulted to ROLLING_DEFAULT_PERIOD_HOURS,
 * clearing period_hours back to null when switching away from "rolling", and
 * the exact partial-PUT payload shape sent to useUpdateUpstreamSection.
 */

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${namespace}.${key}:${JSON.stringify(vars)}` : `${namespace}.${key}`,
}));

const { mockMutate } = vi.hoisted(() => ({ mockMutate: vi.fn() }));

const hookState = { isSaving: false };

vi.mock("@/hooks/use-upstreams", () => ({
  useUpdateUpstreamSection: () => ({ mutate: mockMutate, isPending: hookState.isSaving }),
}));

// Radix Select requires real layout/pointer-capture APIs jsdom doesn't provide
// once opened. Replace it with a flat, always-rendered stand-in so SelectItem
// clicks can drive onValueChange directly, matching the idiom already used for
// other Select-heavy tests in this repo (see traffic-recording-page.test.tsx).
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const ValueChangeContext = React.createContext<((value: string) => void) | undefined>(undefined);

  function Select({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    onValueChange?: (value: string) => void;
  }) {
    return React.createElement(ValueChangeContext.Provider, { value: onValueChange }, children);
  }
  const SelectTrigger = React.forwardRef(function SelectTrigger(
    props: React.ComponentPropsWithoutRef<"button">,
    ref: React.Ref<HTMLButtonElement>
  ) {
    const { children, ...rest } = props;
    return React.createElement("button", { type: "button", ref, ...rest }, children);
  });
  function SelectValue({ placeholder }: { placeholder?: React.ReactNode }) {
    return React.createElement("span", null, placeholder ?? null);
  }
  function SelectContent({ children }: { children: React.ReactNode }) {
    return React.createElement("div", null, children);
  }
  function SelectItem({ children, value }: { children: React.ReactNode; value: string }) {
    const onValueChange = React.useContext(ValueChangeContext);
    return React.createElement(
      "button",
      { type: "button", onClick: () => onValueChange?.(value) },
      children
    );
  }

  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

beforeEach(() => {
  mockMutate.mockReset();
  hookState.isSaving = false;
});

function buildUpstream(overrides: Partial<Upstream> = {}): Upstream {
  return {
    id: "upstream-1",
    name: "Test Upstream",
    base_url: "https://api.example.com/v1",
    official_website_url: null,
    description: null,
    api_key_masked: "sk-***1234",
    is_default: false,
    timeout: 60,
    is_active: true,
    current_concurrency: 0,
    max_concurrency: null,
    queue_policy: null,
    failure_rule_config: null,
    weight: 1,
    priority: 0,
    health_status: null,
    probe_results: [],
    circuit_breaker: null,
    route_capabilities: ["openai_chat_compatible"],
    allowed_models: null,
    model_redirects: null,
    model_discovery: {
      mode: "openai_compatible",
      custom_endpoint: null,
      enable_lite_llm_fallback: false,
      auto_refresh_enabled: false,
    },
    model_catalog: [],
    model_catalog_updated_at: null,
    model_catalog_last_status: null,
    model_catalog_last_error: null,
    model_catalog_last_failed_at: null,
    model_rules: null,
    affinity_migration: null,
    billing_input_multiplier: 1,
    billing_output_multiplier: 1,
    spending_rules: null,
    last_used_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("SpendingQuotaSection", () => {
  it("adds and removes a spending rule via the field array", () => {
    const upstream = buildUpstream();
    const { container } = render(<SpendingQuotaSection upstream={upstream} />);

    expect(screen.getByText("upstreams.noSpendingRules")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "upstreams.addSpendingRule" }));

    expect(screen.queryByText("upstreams.noSpendingRules")).not.toBeInTheDocument();
    expect(screen.getByLabelText("upstreams.spendingPeriodType")).toBeInTheDocument();
    expect(screen.getByLabelText("upstreams.spendingLimit")).toBeInTheDocument();

    const deleteButton = container.querySelector("button.text-status-error");
    expect(deleteButton).not.toBeNull();
    fireEvent.click(deleteButton as HTMLButtonElement);

    expect(screen.getByText("upstreams.noSpendingRules")).toBeInTheDocument();
  });

  it("reveals period_hours defaulted to ROLLING_DEFAULT_PERIOD_HOURS when switching a rule to rolling", () => {
    const upstream = buildUpstream();
    render(<SpendingQuotaSection upstream={upstream} />);

    fireEvent.click(screen.getByRole("button", { name: "upstreams.addSpendingRule" }));
    expect(screen.queryByLabelText("upstreams.spendingPeriodHours")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "upstreams.spendingPeriodRolling" }));

    const periodHoursInput = screen.getByLabelText(
      "upstreams.spendingPeriodHours"
    ) as HTMLInputElement;
    expect(periodHoursInput).toBeInTheDocument();
    expect(periodHoursInput.value).toBe(String(ROLLING_DEFAULT_PERIOD_HOURS));
  });

  it("clears period_hours back to null when switching a rolling rule away from rolling", () => {
    const upstream = buildUpstream();
    render(<SpendingQuotaSection upstream={upstream} />);

    fireEvent.click(screen.getByRole("button", { name: "upstreams.addSpendingRule" }));
    fireEvent.click(screen.getByRole("button", { name: "upstreams.spendingPeriodRolling" }));
    expect(screen.getByLabelText("upstreams.spendingPeriodHours")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "upstreams.spendingPeriodDaily" }));

    expect(screen.queryByLabelText("upstreams.spendingPeriodHours")).not.toBeInTheDocument();
  });

  it("saves with the exact buildSpendingQuotaPayload shape for a rolling rule", async () => {
    const upstream = buildUpstream();
    render(<SpendingQuotaSection upstream={upstream} />);

    fireEvent.click(screen.getByRole("button", { name: "upstreams.addSpendingRule" }));
    fireEvent.click(screen.getByRole("button", { name: "upstreams.spendingPeriodRolling" }));
    fireEvent.change(screen.getByLabelText("upstreams.spendingLimit"), {
      target: { value: "10.5" },
    });

    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    const expectedValues = upstreamSectionSchemas["spending-quota"].parse({
      spending_rules: [
        { period_type: "rolling", limit: "10.5", period_hours: ROLLING_DEFAULT_PERIOD_HOURS },
      ],
    });
    const expectedPayload = buildSpendingQuotaPayload(expectedValues);

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith(
        { id: upstream.id, payload: expectedPayload },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      )
    );
  });
});
