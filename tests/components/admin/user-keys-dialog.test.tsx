import type { ReactNode } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserKeysDialog } from "@/components/admin/user-keys-dialog";
import type { APIKey, User } from "@/types/api";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
  useLocale: () => "en",
}));

const keysQuery = vi.hoisted(() => ({
  data: undefined as { items: APIKey[] } | undefined,
  isLoading: false,
}));
const useAPIKeysMock = vi.hoisted(() => vi.fn());
const revokeOwnerMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-api-keys", () => ({
  useAPIKeys: (...args: unknown[]) => {
    useAPIKeysMock(...args);
    return keysQuery;
  },
}));

vi.mock("@/hooks/use-users", () => ({
  useRevokeApiKeyOwner: () => ({ mutate: revokeOwnerMock, isPending: false, variables: undefined }),
}));

// Radix 的 Dialog 依赖 portal 与动画，这里只关心弹窗内容本身。
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

function makeUser(): User {
  return {
    id: "user-1",
    username: "alice",
    display_name: "Alice Zhang",
    role: "member",
    is_active: true,
    api_key_count: 1,
    month_requests: 0,
    month_cost_usd: 0,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  };
}

function makeKey(overrides: Partial<APIKey> = {}): APIKey {
  return {
    id: "key-1",
    key_prefix: "sk-auto-abcdef123456",
    name: "self-service key",
    description: null,
    access_mode: "restricted",
    upstream_ids: ["up-1"],
    allowed_models: null,
    spending_rules: null,
    spending_rule_statuses: [],
    is_quota_exceeded: false,
    is_active: true,
    user_id: "user-1",
    user_name: "Alice Zhang",
    expires_at: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("UserKeysDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    keysQuery.data = { items: [makeKey()] };
    keysQuery.isLoading = false;
  });

  it("lists the keys owned by the user and unassigns one", () => {
    render(<UserKeysDialog user={makeUser()} open onOpenChange={vi.fn()} />);

    // 按人查询，而不是全局的无归属范围。
    expect(useAPIKeysMock).toHaveBeenCalledWith(1, 100, "", { userId: "user-1" });
    expect(screen.getByText("self-service key")).toBeInTheDocument();
    expect(screen.getByText("sk-auto-abcdef123456")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "users.revokeKeyOwnership" }));
    expect(revokeOwnerMock).toHaveBeenCalledWith({ keyId: "key-1" });
  });

  it("shows an empty state when the user owns no key", () => {
    keysQuery.data = { items: [] };

    render(<UserKeysDialog user={makeUser()} open onOpenChange={vi.fn()} />);

    expect(screen.getByText("users.noKeys")).toBeInTheDocument();
  });

  it("does not query while the dialog is closed", () => {
    render(<UserKeysDialog user={makeUser()} open={false} onOpenChange={vi.fn()} />);

    expect(useAPIKeysMock).not.toHaveBeenCalled();
  });
});
