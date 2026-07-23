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
    disabled_by_admin: false,
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
    expect(screen.getByText("keys.restrictedAccessCount")).toBeInTheDocument();
  });

  it("labels a key as auto-routed when no upstream is exposed", () => {
    render(
      <PortalKeysTable keys={[makeKey({ upstream_ids: [] })]} onEdit={vi.fn()} onRevoke={vi.fn()} />
    );

    // 上游隐藏时后端不返回 upstream_ids，表格不得暴露数量，只显示自动路由。
    expect(screen.getByText("portal.keys.autoRouted")).toBeInTheDocument();
    expect(screen.queryByText("keys.restrictedAccessCount")).not.toBeInTheDocument();
  });

  it("invokes the edit and revoke callbacks for a row", () => {
    const onEdit = vi.fn();
    const onRevoke = vi.fn();
    const key = makeKey();
    render(<PortalKeysTable keys={[key]} onEdit={onEdit} onRevoke={onRevoke} />);

    fireEvent.click(screen.getByRole("button", { name: "keys.editKey" }));
    expect(onEdit).toHaveBeenCalledWith(key, expect.any(HTMLElement));

    fireEvent.click(screen.getByRole("button", { name: "keys.revokeKey" }));
    expect(onRevoke).toHaveBeenCalledWith(key, expect.any(HTMLElement));

    // 容器变形动画需要源元素：表格行须带 data-morph-source 供按钮 closest 取到。
    const editSource = onEdit.mock.calls[0][1] as HTMLElement;
    expect(editSource.hasAttribute("data-morph-source")).toBe(true);
  });

  it("toggles the active state through the portal mutation", () => {
    render(<PortalKeysTable keys={[makeKey()]} onEdit={vi.fn()} onRevoke={vi.fn()} />);

    fireEvent.click(screen.getByRole("switch"));

    expect(toggleMutateMock).toHaveBeenCalledWith({ id: "key-1", nextActive: false });
  });

  it("locks the toggle and labels an admin-disabled key", () => {
    render(
      <PortalKeysTable
        keys={[makeKey({ is_active: false, disabled_by_admin: true })]}
        onEdit={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    // The member cannot flip an admin-disabled key back on from the portal.
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByText("portal.keys.disabledByAdmin")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));
    expect(toggleMutateMock).not.toHaveBeenCalled();
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
