import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PortalKeysTable } from "@/components/portal/portal-keys-table";
import type { APIKey } from "@/types/api";

const toggleMutateMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return t;
  },
  useLocale: () => "en",
}));

vi.mock("@/hooks/use-portal-keys", () => ({
  useTogglePortalKeyActive: () => ({
    mutate: toggleMutateMock,
    isPending: false,
  }),
}));

function makeKey(overrides: Partial<APIKey> = {}): APIKey {
  return {
    id: "key-1",
    key_prefix: "sk-auto-abcdef123456",
    name: "my key",
    description: "personal key",
    access_mode: "restricted",
    upstream_ids: ["up-1", "up-2"],
    allowed_models: null,
    spending_rules: null,
    spending_rule_statuses: [],
    is_quota_exceeded: false,
    is_active: true,
    expires_at: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("PortalKeysTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders an empty state when there are no keys", () => {
    render(<PortalKeysTable keys={[]} onEdit={vi.fn()} onRevoke={vi.fn()} />);

    expect(screen.getByText("keys.noKeys")).toBeInTheDocument();
    expect(screen.getByText("portal.keys.noKeysDesc")).toBeInTheDocument();
  });

  it("renders key rows with a masked prefix and upstream count", () => {
    render(<PortalKeysTable keys={[makeKey()]} onEdit={vi.fn()} onRevoke={vi.fn()} />);

    expect(screen.getByText("my key")).toBeInTheDocument();
    expect(screen.getByText("personal key")).toBeInTheDocument();
    // sk-auto-abcdef123456 → first 8 + *** + last 4
    expect(screen.getByText("sk-auto-***3456")).toBeInTheDocument();
  });

  it("invokes the edit and revoke callbacks for a row", () => {
    const onEdit = vi.fn();
    const onRevoke = vi.fn();
    const key = makeKey();
    render(<PortalKeysTable keys={[key]} onEdit={onEdit} onRevoke={onRevoke} />);

    fireEvent.click(screen.getByRole("button", { name: "keys.editKey" }));
    expect(onEdit).toHaveBeenCalledWith(key);

    fireEvent.click(screen.getByRole("button", { name: "keys.revokeKey" }));
    expect(onRevoke).toHaveBeenCalledWith(key);
  });

  it("toggles the active state through the portal mutation", () => {
    render(<PortalKeysTable keys={[makeKey()]} onEdit={vi.fn()} onRevoke={vi.fn()} />);

    fireEvent.click(screen.getByRole("switch"));

    expect(toggleMutateMock).toHaveBeenCalledWith({ id: "key-1", nextActive: false });
  });

  it("marks an exceeded quota", () => {
    render(
      <PortalKeysTable
        keys={[
          makeKey({
            is_quota_exceeded: true,
            spending_rule_statuses: [
              {
                period_type: "daily",
                period_hours: null,
                current_spending: 10,
                spending_limit: 5,
                percent_used: 200,
                is_exceeded: true,
                resets_at: null,
                estimated_recovery_at: null,
              },
            ],
          }),
        ]}
        onEdit={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    expect(screen.getByText("keys.quotaExceeded")).toBeInTheDocument();
  });
});
