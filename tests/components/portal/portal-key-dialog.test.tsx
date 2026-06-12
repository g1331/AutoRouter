import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PortalKeyDialog } from "@/components/portal/portal-key-dialog";
import type { APIKey } from "@/types/api";

const createMutateAsyncMock = vi.fn();
const updateMutateAsyncMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
  useLocale: () => "en",
}));

vi.mock("@/hooks/use-portal-keys", () => ({
  useCreatePortalKey: () => ({
    mutateAsync: createMutateAsyncMock,
    isPending: false,
  }),
  useUpdatePortalKey: () => ({
    mutateAsync: updateMutateAsyncMock,
    isPending: false,
  }),
  usePortalUpstreamOptions: () => ({
    data: {
      items: [
        { id: "up-1", name: "alpha" },
        { id: "up-2", name: "beta" },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock("@/components/admin/show-key-dialog", () => ({
  ShowKeyDialog: ({ apiKey }: { apiKey: { key_value: string } }) => (
    <div data-testid="show-key-dialog" data-key-value={apiKey.key_value} />
  ),
}));

function makeKey(overrides: Partial<APIKey> = {}): APIKey {
  return {
    id: "key-1",
    key_prefix: "sk-auto-abcdef123456",
    name: "my key",
    description: "personal key",
    access_mode: "restricted",
    upstream_ids: ["up-1"],
    allowed_models: null,
    spending_rules: [{ period_type: "daily", limit: 5 }],
    spending_rule_statuses: [],
    is_quota_exceeded: false,
    is_active: true,
    expires_at: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("PortalKeyDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a key from the granted upstream options and shows the value once", async () => {
    createMutateAsyncMock.mockResolvedValue({
      ...makeKey(),
      key_value: "sk-auto-full-secret",
    });
    const onOpenChange = vi.fn();

    render(<PortalKeyDialog mode="create" open onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByPlaceholderText("keys.keyNamePlaceholder"), {
      target: { value: "new key" },
    });
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "common.create" }));

    await waitFor(() => {
      expect(createMutateAsyncMock).toHaveBeenCalledWith({
        name: "new key",
        upstream_ids: ["up-1"],
        description: null,
        spending_rules: null,
      });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("show-key-dialog")).toHaveAttribute(
      "data-key-value",
      "sk-auto-full-secret"
    );
  });

  it("requires at least one upstream before creating", async () => {
    render(<PortalKeyDialog mode="create" open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("keys.keyNamePlaceholder"), {
      target: { value: "new key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "common.create" }));

    await waitFor(() => {
      expect(screen.getByText("keys.selectUpstreamsRequired")).toBeInTheDocument();
    });
    expect(createMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("rejects a non-positive spending rule limit before submitting", async () => {
    render(<PortalKeyDialog mode="create" open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("keys.keyNamePlaceholder"), {
      target: { value: "new key" },
    });
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: /keys.addSpendingRule/ }));
    fireEvent.click(screen.getByRole("button", { name: "common.create" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("keys.quotaLimitPositive");
    });
    expect(createMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("prefills the edit form and submits the update payload", async () => {
    updateMutateAsyncMock.mockResolvedValue(makeKey());
    const onOpenChange = vi.fn();

    render(<PortalKeyDialog mode="edit" apiKey={makeKey()} open onOpenChange={onOpenChange} />);

    const nameInput = screen.getByPlaceholderText("keys.keyNamePlaceholder");
    expect(nameInput).toHaveValue("my key");

    fireEvent.change(nameInput, { target: { value: "renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => {
      expect(updateMutateAsyncMock).toHaveBeenCalledWith({
        id: "key-1",
        data: {
          name: "renamed",
          description: "personal key",
          upstream_ids: ["up-1"],
          spending_rules: [{ period_type: "daily", limit: 5 }],
        },
      });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
