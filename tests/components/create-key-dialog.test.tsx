import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateKeyDialog } from "@/components/admin/create-key-dialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// Mock date-locale
vi.mock("@/lib/date-locale", () => ({
  getDateLocale: () => undefined,
}));

// Mock hooks
const mockCreateMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();

vi.mock("@/hooks/use-api-keys", () => ({
  useCreateAPIKey: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
  useUpdateAPIKey: () => ({
    mutateAsync: mockUpdateMutateAsync,
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

// Mock ShowKeyDialog
vi.mock("@/components/admin/show-key-dialog", () => ({
  ShowKeyDialog: () => null,
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
      });
    });

    it("renders upstream checkboxes", async () => {
      render(<CreateKeyDialog />, { wrapper: Wrapper });

      fireEvent.click(screen.getByText("createKey"));

      await waitFor(() => {
        expect(screen.getByText("OpenAI")).toBeInTheDocument();
        expect(screen.getByText("Anthropic")).toBeInTheDocument();
      });
    });

    it("renders upstream description when present", async () => {
      render(<CreateKeyDialog />, { wrapper: Wrapper });

      fireEvent.click(screen.getByText("createKey"));

      await waitFor(() => {
        expect(screen.getByText("OpenAI API")).toBeInTheDocument();
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
    });

    it("shows validation error when no upstream selected", async () => {
      render(<CreateKeyDialog />, { wrapper: Wrapper });

      fireEvent.click(screen.getByText("createKey"));

      await waitFor(() => {
        expect(screen.getByPlaceholderText("keyNamePlaceholder")).toBeInTheDocument();
      });

      // Fill name but no upstream
      const nameInput = screen.getByPlaceholderText("keyNamePlaceholder");
      fireEvent.change(nameInput, { target: { value: "Test Key" } });

      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(screen.getByText("selectUpstreamsRequired")).toBeInTheDocument();
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
