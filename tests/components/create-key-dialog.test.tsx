import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateKeyDialog } from "@/components/admin/create-key-dialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// The thin create dialog only captures name/description; access, spending
// rules, model allowlist, and expiry now live on the /keys/[id] detail page
// (Phase C1). This rewrite replaces the old fat-dialog suite, which exercised
// fields the dialog no longer renders and failed to load entirely because
// next/navigation (pulled in transitively via @/i18n/navigation's useRouter)
// was unmocked.

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockPush = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));

const mockCreateMutateAsync = vi.fn();
vi.mock("@/hooks/use-api-keys", () => ({
  useCreateAPIKey: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
}));

describe("CreateKeyDialog", () => {
  let queryClient: QueryClient;

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mockCreateMutateAsync.mockReset();
    mockPush.mockReset();
  });

  it("renders the trigger button and opens the dialog", async () => {
    render(<CreateKeyDialog />, { wrapper: Wrapper });

    expect(screen.getByText("createKey")).toBeInTheDocument();

    fireEvent.click(screen.getByText("createKey"));

    await waitFor(() => {
      expect(screen.getByText("createKeyTitle")).toBeInTheDocument();
    });
  });

  it("renders only the name and description fields — no access/spending/model/expiry fields", async () => {
    render(<CreateKeyDialog />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("createKey"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("keyNamePlaceholder")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("keyDescriptionPlaceholder")).toBeInTheDocument();
      // The configure-later hint replaces the fat form's remaining sections.
      expect(screen.getByText("createKeyConfigureHint")).toBeInTheDocument();
    });

    // Fields that used to live in this dialog now belong to the detail page.
    expect(screen.queryByText("unrestrictedAccess")).not.toBeInTheDocument();
    expect(screen.queryByText("restrictedAccess")).not.toBeInTheDocument();
    expect(screen.queryByText("addSpendingRule")).not.toBeInTheDocument();
    expect(screen.queryByText("allowedModels")).not.toBeInTheDocument();
    expect(screen.queryByText("expirationDate")).not.toBeInTheDocument();
  });

  it("shows a validation error when name is empty", async () => {
    render(<CreateKeyDialog />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("createKey"));

    await waitFor(() => {
      expect(screen.getByText("create")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("create"));

    await waitFor(() => {
      expect(screen.getByText("keyNameRequired")).toBeInTheDocument();
    });

    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });

  it("submits the minimal payload — name, description, and empty upstream_ids", async () => {
    mockCreateMutateAsync.mockResolvedValueOnce({
      id: "key-1",
      key_value: "sk-auto-test",
      key_prefix: "sk-auto-test",
      name: "Test Key",
      description: null,
      access_mode: "unrestricted",
      upstream_ids: [],
      allowed_models: null,
      spending_rules: null,
      spending_rule_statuses: [],
      is_quota_exceeded: false,
      is_active: true,
      expires_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    });

    render(<CreateKeyDialog />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("createKey"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("keyNamePlaceholder")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("keyNamePlaceholder"), {
      target: { value: "Test Key" },
    });
    fireEvent.click(screen.getByText("create"));

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        name: "Test Key",
        description: null,
        upstream_ids: [],
      });
    });
  });

  it("includes a trimmed description in the payload when provided", async () => {
    mockCreateMutateAsync.mockResolvedValueOnce({
      id: "key-2",
      key_value: "sk-auto-test-2",
      key_prefix: "sk-auto-test-2",
      name: "Described Key",
      description: "Used by the billing service",
      access_mode: "unrestricted",
      upstream_ids: [],
      allowed_models: null,
      spending_rules: null,
      spending_rule_statuses: [],
      is_quota_exceeded: false,
      is_active: true,
      expires_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    });

    render(<CreateKeyDialog />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("createKey"));
    fireEvent.change(screen.getByPlaceholderText("keyNamePlaceholder"), {
      target: { value: "Described Key" },
    });
    fireEvent.change(screen.getByPlaceholderText("keyDescriptionPlaceholder"), {
      target: { value: "Used by the billing service" },
    });
    fireEvent.click(screen.getByText("create"));

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        name: "Described Key",
        description: "Used by the billing service",
        upstream_ids: [],
      });
    });
  });

  it("closes the dialog when cancel is clicked", async () => {
    render(<CreateKeyDialog />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("createKey"));

    await waitFor(() => {
      expect(screen.getByText("createKeyTitle")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("cancel"));

    await waitFor(() => {
      expect(screen.queryByText("createKeyTitle")).not.toBeInTheDocument();
    });
  });

  describe("one-time key reveal", () => {
    const createdKey = {
      id: "key-reveal",
      key_value: "sk-auto-reveal-secret",
      key_prefix: "sk-auto-rev",
      name: "Reveal Key",
      description: null,
      access_mode: "unrestricted" as const,
      upstream_ids: [],
      allowed_models: null,
      spending_rules: null,
      spending_rule_statuses: [],
      is_quota_exceeded: false,
      is_active: true,
      expires_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };

    beforeEach(() => {
      mockCreateMutateAsync.mockResolvedValueOnce(createdKey);
    });

    it("shows the ShowKeyDialog one-time reveal after a successful create, closes the create dialog", async () => {
      render(<CreateKeyDialog />, { wrapper: Wrapper });

      fireEvent.click(screen.getByText("createKey"));
      fireEvent.change(screen.getByPlaceholderText("keyNamePlaceholder"), {
        target: { value: "Reveal Key" },
      });
      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(screen.getByText("keyCreated")).toBeInTheDocument();
        expect(screen.getByText(createdKey.key_value)).toBeInTheDocument();
      });

      // The create dialog itself is closed once the reveal dialog takes over.
      expect(screen.queryByText("createKeyTitle")).not.toBeInTheDocument();
    });

    it("navigates to the detail page once the reveal dialog is closed", async () => {
      render(<CreateKeyDialog />, { wrapper: Wrapper });

      fireEvent.click(screen.getByText("createKey"));
      fireEvent.change(screen.getByPlaceholderText("keyNamePlaceholder"), {
        target: { value: "Reveal Key" },
      });
      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(screen.getByText("keyCreated")).toBeInTheDocument();
      });

      expect(mockPush).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText("close"));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(`/keys/${createdKey.id}`);
      });
    });
  });
});
