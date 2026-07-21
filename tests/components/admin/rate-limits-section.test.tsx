import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RateLimitsSection } from "@/components/admin/key/sections/rate-limits-section";
import { buildRateLimitsPayload } from "@/components/admin/key/section-payloads";
import { apiKeySectionSchemas } from "@/components/admin/key/section-schemas";
import type { APIKeyResponse } from "@/types/api";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace}.${key}`,
}));

const { mockMutate } = vi.hoisted(() => ({ mockMutate: vi.fn() }));

vi.mock("@/hooks/use-api-keys", () => ({
  useUpdateApiKeySection: () => ({ mutate: mockMutate, isPending: false }),
}));

function makeApiKey(overrides: Partial<APIKeyResponse> = {}): APIKeyResponse {
  return {
    id: "key-1",
    key_prefix: "sk-test",
    name: "Test Key",
    description: null,
    access_mode: "unrestricted",
    upstream_ids: [],
    allowed_models: null,
    spending_rules: null,
    rpm_limit: null,
    tpm_limit: null,
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

describe("RateLimitsSection", () => {
  beforeEach(() => {
    mockMutate.mockReset();
  });

  it("renders persisted RPM and TPM values independently", () => {
    render(<RateLimitsSection apiKey={makeApiKey({ rpm_limit: 60, tpm_limit: 120000 })} />);

    expect(screen.getByLabelText("keys.rpmLimit")).toHaveValue(60);
    expect(screen.getByLabelText("keys.tpmLimit")).toHaveValue(120000);
  });

  it("saves both fields as null when the administrator clears them", async () => {
    render(<RateLimitsSection apiKey={makeApiKey({ rpm_limit: 60, tpm_limit: 120000 })} />);

    fireEvent.change(screen.getByLabelText("keys.rpmLimit"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("keys.tpmLimit"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith(
        { id: "key-1", payload: { rpm_limit: null, tpm_limit: null } },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      )
    );
  });

  it("saves a partial-PUT payload containing only the two rate-limit fields", async () => {
    render(<RateLimitsSection apiKey={makeApiKey()} />);

    fireEvent.change(screen.getByLabelText("keys.rpmLimit"), { target: { value: "90" } });
    fireEvent.change(screen.getByLabelText("keys.tpmLimit"), { target: { value: "150000" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    const values = apiKeySectionSchemas["rate-limits"].parse({
      rpm_limit: "90",
      tpm_limit: "150000",
    });
    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith(
        { id: "key-1", payload: buildRateLimitsPayload(values) },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      )
    );
  });
});
