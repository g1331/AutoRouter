import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { addDays, addYears, format, startOfDay } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExpirySection } from "@/components/admin/key/sections/expiry-section";
import { buildExpiryPayload } from "@/components/admin/key/section-payloads";
import { apiKeySectionSchemas } from "@/components/admin/key/section-schemas";
import type { APIKeyResponse } from "@/types/api";

/**
 * Behavior tests for ExpirySection: quick presets (+30/+90/+365 days),
 * clearing the stored expiry, the exact partial-PUT payload, and the
 * calendar bounds extending to a stored PAST expiry (the min/max fix —
 * without it react-day-picker clamps the initial month to today).
 */

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${namespace}.${key}:${JSON.stringify(vars)}` : `${namespace}.${key}`,
  useLocale: () => "en",
}));

vi.mock("@/lib/date-locale", () => ({
  getDateLocale: () => undefined,
}));

const { mockMutate } = vi.hoisted(() => ({ mockMutate: vi.fn() }));

vi.mock("@/hooks/use-api-keys", () => ({
  useUpdateApiKeySection: () => ({ mutate: mockMutate, isPending: false }),
}));

beforeEach(() => {
  mockMutate.mockReset();
});

function buildApiKey(overrides: Partial<APIKeyResponse> = {}): APIKeyResponse {
  return {
    id: "key-1",
    key_prefix: "sk-test",
    name: "Test Key",
    description: null,
    access_mode: "full",
    upstream_ids: [],
    allowed_models: null,
    spending_rules: null,
    spending_rule_statuses: [],
    is_quota_exceeded: false,
    is_active: true,
    disabled_by_admin: false,
    expires_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ExpirySection", () => {
  it("shows the placeholder and no clear button when there is no expiry", () => {
    render(<ExpirySection apiKey={buildApiKey()} />);

    expect(screen.getByText("keys.selectDate")).toBeInTheDocument();
    expect(screen.queryByText("common.clear")).not.toBeInTheDocument();
  });

  it("renders the three quick presets", () => {
    render(<ExpirySection apiKey={buildApiKey()} />);

    expect(screen.getByText("keys.expiryPresets.30")).toBeInTheDocument();
    expect(screen.getByText("keys.expiryPresets.90")).toBeInTheDocument();
    expect(screen.getByText("keys.expiryPresets.365")).toBeInTheDocument();
  });

  it("sets the expiry via a preset and saves the exact payload", async () => {
    render(<ExpirySection apiKey={buildApiKey()} />);

    fireEvent.click(screen.getByText("keys.expiryPresets.30"));

    const expected = addDays(startOfDay(new Date()), 30);
    expect(screen.getByText(format(expected, "PPP"))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    const expectedPayload = buildExpiryPayload(
      apiKeySectionSchemas["expiry"].parse({ expires_at: expected })
    );
    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith(
        { id: "key-1", payload: expectedPayload },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      )
    );

    // onSuccess re-baselines the form to the saved values (dirty state clears).
    mockMutate.mock.calls[0][1].onSuccess();
    await waitFor(() => expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled());
  });

  it("resets an unsaved preset back to the stored value", () => {
    render(<ExpirySection apiKey={buildApiKey()} />);

    fireEvent.click(screen.getByText("keys.expiryPresets.90"));
    fireEvent.click(screen.getByRole("button", { name: "common.reset" }));

    expect(screen.getByText("keys.selectDate")).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("clears a stored expiry and saves expires_at null", async () => {
    const expiresAt = addYears(startOfDay(new Date()), 1);
    render(<ExpirySection apiKey={buildApiKey({ expires_at: expiresAt.toISOString() })} />);

    expect(screen.getByText(format(expiresAt, "PPP"))).toBeInTheDocument();

    fireEvent.click(screen.getByText("common.clear"));
    expect(screen.getByText("keys.selectDate")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith(
        { id: "key-1", payload: { expires_at: null } },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      )
    );
  });

  it("opens the calendar on the stored PAST expiry month instead of clamping to today", () => {
    // A key that expired long ago — startMonth must extend back to it.
    render(<ExpirySection apiKey={buildApiKey({ expires_at: "2020-05-15T00:00:00.000Z" })} />);

    // FormControl labels the trigger via the sr-only FormLabel, not its content.
    fireEvent.click(screen.getByRole("button", { name: "keys.expirationDate" }));

    const yearSelect = screen.getByRole("combobox", { name: /year/i }) as HTMLSelectElement;
    expect(yearSelect.value).toBe("2020");
    const monthSelect = screen.getByRole("combobox", { name: /month/i }) as HTMLSelectElement;
    // rdp months are 0-indexed; May = 4
    expect(monthSelect.value).toBe("4");
  });

  it("extends the calendar bounds past +10y for a stored far-future expiry", () => {
    const farFuture = addYears(startOfDay(new Date()), 20);
    render(<ExpirySection apiKey={buildApiKey({ expires_at: farFuture.toISOString() })} />);

    fireEvent.click(screen.getByRole("button", { name: "keys.expirationDate" }));

    const yearSelect = screen.getByRole("combobox", { name: /year/i }) as HTMLSelectElement;
    expect(yearSelect.value).toBe(String(farFuture.getFullYear()));
  });
});
