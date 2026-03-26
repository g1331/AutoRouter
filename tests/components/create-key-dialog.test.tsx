import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateKeyDialog } from "@/components/admin/create-key-dialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { mockToastError } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// Mock date-locale
vi.mock("@/lib/date-locale", () => ({
  getDateLocale: () => undefined,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
    success: vi.fn(),
  },
}));

// Mock hooks
const mockCreateMutateAsync = vi.fn();
vi.mock("@/hooks/use-api-keys", () => ({
  useCreateAPIKey: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
}));

const mockUpstreams = [
  {
    id: "upstream-1",
    name: "OpenAI",
    provider: "openai",
    description: "OpenAI API",
  },
  {
    id: "upstream-2",
    name: "Anthropic",
    provider: "anthropic",
    description: null,
  },
];

vi.mock("@/hooks/use-upstreams", () => ({
  useAllUpstreams: () => ({
    data: mockUpstreams,
    isLoading: false,
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
    mockToastError.mockReset();
  });

  describe("Trigger Button", () => {
    it("renders create key button", () => {
      render(<CreateKeyDialog />, { wrapper: Wrapper });

      expect(screen.getByText("createKey")).toBeInTheDocument();
    });

    it("opens dialog when button is clicked", async () => {
      render(<CreateKeyDialog />, { wrapper: Wrapper });

      const createButton = screen.getByText("createKey");
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText("createKeyTitle")).toBeInTheDocument();
      });
    });
  });

  describe("Dialog Content", () => {
    it("renders form fields when dialog is open", async () => {
      render(<CreateKeyDialog />, { wrapper: Wrapper });

      fireEvent.click(screen.getByText("createKey"));

      await waitFor(() => {
        // Check for form fields by placeholder/input existence
        expect(screen.getByPlaceholderText("keyNamePlaceholder")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("keyDescriptionPlaceholder")).toBeInTheDocument();
        expect(screen.getByText("expirationDate")).toBeInTheDocument();
        expect(screen.getByText("unrestrictedAccess")).toBeInTheDocument();
        expect(screen.getByText("restrictedAccess")).toBeInTheDocument();
      });
    });

    it("renders upstream checkboxes only in restricted mode", async () => {
      render(<CreateKeyDialog />, { wrapper: Wrapper });

      fireEvent.click(screen.getByText("createKey"));

      expect(screen.queryByText("OpenAI")).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("restrictedAccess"));

      await waitFor(() => {
        expect(screen.getByText("OpenAI")).toBeInTheDocument();
        expect(screen.getByText("Anthropic")).toBeInTheDocument();
      });
    });

    it("renders upstream description when present", async () => {
      render(<CreateKeyDialog />, { wrapper: Wrapper });

      fireEvent.click(screen.getByText("createKey"));
      fireEvent.click(screen.getByText("restrictedAccess"));

      await waitFor(() => {
        expect(screen.getByText("OpenAI API")).toBeInTheDocument();
      });
    });

    it("filters upstreams with the search input", async () => {
      render(<CreateKeyDialog />, { wrapper: Wrapper });

      fireEvent.click(screen.getByText("createKey"));
      fireEvent.click(screen.getByText("restrictedAccess"));

      await waitFor(() => {
        expect(screen.getByPlaceholderText("searchUpstreams")).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText("searchUpstreams"), {
        target: { value: "Anthro" },
      });

      await waitFor(() => {
        expect(screen.getByText("Anthropic")).toBeInTheDocument();
        expect(screen.queryByText("OpenAI")).not.toBeInTheDocument();
      });
    });

    it("toggles all visible upstreams from the current search", async () => {
      mockCreateMutateAsync.mockResolvedValueOnce({
        id: "key-1",
        key_value: "sk-auto-test",
        key_prefix: "sk-auto-test",
        name: "Filtered Key",
        description: null,
        access_mode: "restricted",
        upstream_ids: ["upstream-2"],
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
      fireEvent.click(screen.getByText("restrictedAccess"));
      fireEvent.change(screen.getByPlaceholderText("searchUpstreams"), {
        target: { value: "Anthro" },
      });
      fireEvent.click(screen.getByText("selectFilteredUpstreams"));

      await waitFor(() => {
        expect(screen.getByText("deselectFilteredUpstreams")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("deselectFilteredUpstreams"));
      fireEvent.click(screen.getByText("selectFilteredUpstreams"));
      fireEvent.change(screen.getByPlaceholderText("keyNamePlaceholder"), {
        target: { value: "Filtered Key" },
      });
      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith({
          name: "Filtered Key",
          description: null,
          access_mode: "restricted",
          upstream_ids: ["upstream-2"],
          expires_at: null,
          spending_rules: null,
        });
      });
    });

    it("renders cancel and create buttons", async () => {
      render(<CreateKeyDialog />, { wrapper: Wrapper });

      fireEvent.click(screen.getByText("createKey"));

      await waitFor(() => {
        expect(screen.getByText("cancel")).toBeInTheDocument();
        expect(screen.getByText("create")).toBeInTheDocument();
      });
    });

    it("allows adding a spending rule and submits it", async () => {
      mockCreateMutateAsync.mockResolvedValueOnce({
        id: "key-2",
        key_value: "sk-auto-quota",
        key_prefix: "sk-auto-quota",
        name: "Quota Key",
        description: null,
        access_mode: "unrestricted",
        upstream_ids: [],
        spending_rules: [{ period_type: "daily", limit: 12.5 }],
        spending_rule_statuses: [],
        is_quota_exceeded: false,
        is_active: true,
        expires_at: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      render(<CreateKeyDialog />, { wrapper: Wrapper });

      fireEvent.click(screen.getByText("createKey"));
      fireEvent.click(screen.getByText("addSpendingRule"));
      fireEvent.change(screen.getByPlaceholderText("keyNamePlaceholder"), {
        target: { value: "Quota Key" },
      });
      fireEvent.change(screen.getByPlaceholderText("quotaLimitPlaceholder"), {
        target: { value: "12.5" },
      });
      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith({
          name: "Quota Key",
          description: null,
          access_mode: "unrestricted",
          upstream_ids: [],
          expires_at: null,
          spending_rules: [{ period_type: "daily", limit: 12.5 }],
        });
      });
    });

    it("keeps spending rule numeric inputs editable through empty string and zero", async () => {
      mockCreateMutateAsync.mockResolvedValueOnce({
        id: "key-3",
        key_value: "sk-auto-sequence",
        key_prefix: "sk-auto-sequence",
        name: "Sequence Key",
        description: null,
        access_mode: "unrestricted",
        upstream_ids: [],
        spending_rules: [{ period_type: "rolling", limit: 5, period_hours: 5 }],
        spending_rule_statuses: [],
        is_quota_exceeded: false,
        is_active: true,
        expires_at: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      render(<CreateKeyDialog />, { wrapper: Wrapper });

      fireEvent.click(screen.getByText("createKey"));
      fireEvent.click(screen.getByText("addSpendingRule"));
      fireEvent.change(screen.getByPlaceholderText("keyNamePlaceholder"), {
        target: { value: "Sequence Key" },
      });

      const limitInput = screen.getByPlaceholderText("quotaLimitPlaceholder") as HTMLInputElement;
      fireEvent.change(limitInput, { target: { value: "30" } });
      expect(limitInput.value).toBe("30");
      fireEvent.change(limitInput, { target: { value: "3" } });
      expect(limitInput.value).toBe("3");
      fireEvent.change(limitInput, { target: { value: "" } });
      expect(limitInput.value).toBe("");
      fireEvent.change(limitInput, { target: { value: "0" } });
      expect(limitInput.value).toBe("0");
      fireEvent.change(limitInput, { target: { value: "5" } });
      expect(limitInput.value).toBe("5");

      fireEvent.click(screen.getByText("quotaPeriodType_rolling"));

      const periodHoursInput = screen.getByPlaceholderText(
        "quotaPeriodHoursPlaceholder"
      ) as HTMLInputElement;
      fireEvent.change(periodHoursInput, { target: { value: "30" } });
      expect(periodHoursInput.value).toBe("30");
      fireEvent.change(periodHoursInput, { target: { value: "3" } });
      expect(periodHoursInput.value).toBe("3");
      fireEvent.change(periodHoursInput, { target: { value: "" } });
      expect(periodHoursInput.value).toBe("");
      fireEvent.change(periodHoursInput, { target: { value: "0" } });
      expect(periodHoursInput.value).toBe("0");
      fireEvent.change(periodHoursInput, { target: { value: "5" } });
      expect(periodHoursInput.value).toBe("5");

      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith({
          name: "Sequence Key",
          description: null,
          access_mode: "unrestricted",
          upstream_ids: [],
          expires_at: null,
          spending_rules: [{ period_type: "rolling", limit: 5, period_hours: 5 }],
        });
      });
    });
  });

  describe("Form Validation", () => {
    it("shows validation error when name is empty", async () => {
      render(<CreateKeyDialog />, { wrapper: Wrapper });

      fireEvent.click(screen.getByText("createKey"));

      await waitFor(() => {
        expect(screen.getByText("create")).toBeInTheDocument();
      });

      // Click create without filling form
      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(screen.getByText("keyNameRequired")).toBeInTheDocument();
      });

      expect(mockToastError).toHaveBeenCalledWith("formValidationFailed");
    });

    it("shows localized spending rule error instead of default english number error", async () => {
      render(<CreateKeyDialog />, { wrapper: Wrapper });

      fireEvent.click(screen.getByText("createKey"));
      fireEvent.click(screen.getByText("addSpendingRule"));
      fireEvent.change(screen.getByPlaceholderText("keyNamePlaceholder"), {
        target: { value: "Localized Error Key" },
      });
      fireEvent.change(screen.getByPlaceholderText("quotaLimitPlaceholder"), {
        target: { value: "" },
      });

      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(screen.getByText("quotaLimitPositive")).toBeInTheDocument();
      });

      expect(
        screen.queryByText("Invalid input: expected number, received undefined")
      ).not.toBeInTheDocument();
    });

    it("allows submit without selecting upstreams in unrestricted mode", async () => {
      mockCreateMutateAsync.mockResolvedValueOnce({
        id: "key-1",
        key_value: "sk-auto-test",
        key_prefix: "sk-auto-test",
        name: "Test Key",
        description: null,
        access_mode: "unrestricted",
        upstream_ids: [],
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
          access_mode: "unrestricted",
          upstream_ids: [],
          expires_at: null,
          spending_rules: null,
        });
      });
    });

    it("shows validation error when no upstream selected in restricted mode", async () => {
      render(<CreateKeyDialog />, { wrapper: Wrapper });

      fireEvent.click(screen.getByText("createKey"));

      await waitFor(() => {
        expect(screen.getByPlaceholderText("keyNamePlaceholder")).toBeInTheDocument();
      });

      // Fill name but no upstream
      const nameInput = screen.getByPlaceholderText("keyNamePlaceholder");
      fireEvent.change(nameInput, { target: { value: "Test Key" } });
      fireEvent.click(screen.getByText("restrictedAccess"));

      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(screen.getByText("selectUpstreamsRequired")).toBeInTheDocument();
      });
    });

    it("selects all visible upstreams from the filtered results", async () => {
      mockCreateMutateAsync.mockResolvedValueOnce({
        id: "key-1",
        key_value: "sk-auto-test",
        key_prefix: "sk-auto-test",
        name: "Filtered Key",
        description: null,
        access_mode: "restricted",
        upstream_ids: ["upstream-1"],
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
      fireEvent.click(screen.getByText("restrictedAccess"));

      await waitFor(() => {
        expect(screen.getByPlaceholderText("searchUpstreams")).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText("keyNamePlaceholder"), {
        target: { value: "Filtered Key" },
      });
      fireEvent.change(screen.getByPlaceholderText("searchUpstreams"), {
        target: { value: "Open" },
      });
      fireEvent.click(screen.getByText("selectFilteredUpstreams"));
      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith({
          name: "Filtered Key",
          description: null,
          access_mode: "restricted",
          upstream_ids: ["upstream-1"],
          expires_at: null,
          spending_rules: null,
        });
      });
    });
  });

  describe("Dialog Close", () => {
    it("closes dialog when cancel is clicked", async () => {
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
  });
});
