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
    vi.clearAllMocks();
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

    it("allows submit without selecting upstreams in unrestricted mode", async () => {
      mockCreateMutateAsync.mockResolvedValueOnce({
        id: "key-1",
        key_value: "sk-auto-test",
        key_prefix: "sk-auto-test",
        name: "Test Key",
        description: null,
        access_mode: "unrestricted",
        upstream_ids: [],
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
