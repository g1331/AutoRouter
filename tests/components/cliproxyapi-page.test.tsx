import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import CliproxyApiPage from "@/app/[locale]/(dashboard)/system/cliproxyapi/page";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${Object.values(values).join(":")}` : key,
}));

vi.mock("@/components/admin/topbar", () => ({
  Topbar: ({ title }: { title: string }) => <header>{title}</header>,
}));

const mockSaveMutate = vi.fn();
const mockTestMutate = vi.fn();
const mockTestMutateAsync = vi.fn();
const mockStartOauth = vi.fn();
const mockUpdateAccount = vi.fn();
const mockBuildPreset = vi.fn();
const mockRefetchAccounts = vi.fn();

const mockConfigData = {
  items: [
    {
      id: "conn-1",
      name: "Local CPA",
      mode: "external",
      base_url: "http://localhost:8317/v1",
      client_api_key_masked: "cpa-***1234",
      client_api_key_configured: true,
      management_url: "http://localhost:8317/v0/management",
      management_secret_masked: "mgmt-***1234",
      management_secret_configured: true,
      outbound_proxy_url: null,
      is_enabled: true,
      is_default: true,
      last_tested_at: null,
      last_status: "success",
      last_error: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ],
  default_connection: null,
};

vi.mock("@/components/admin/upstream-form-dialog", () => ({
  UpstreamFormDialog: ({
    open,
    initialCliproxyApiPreset,
  }: {
    open: boolean;
    initialCliproxyApiPreset?: { name: string } | null;
  }) => (open ? <div data-testid="upstream-dialog">{initialCliproxyApiPreset?.name}</div> : null),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button type="button" aria-pressed={checked} onClick={() => onCheckedChange?.(!checked)}>
      switch
    </button>
  ),
}));

vi.mock("@/hooks/use-cliproxyapi", () => ({
  useCliproxyApiConfig: () => ({
    data: mockConfigData,
  }),
  useCliproxyApiStatus: () => ({ data: null }),
  useCliproxyApiAccounts: () => ({
    data: {
      items: [
        {
          id: "codex.json",
          provider: "codex",
          name: "codex.json",
          prefix: "main",
          enabled: true,
          model_count: 1,
          status: "ready",
          error: null,
          cooldown_until: null,
          metadata: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockRefetchAccounts,
  }),
  useCliproxyApiAccountModels: () => ({
    data: {
      items: [
        { model: "gpt-5-codex", provider: "codex", account_id: null, account_prefix: "main" },
      ],
    },
    isFetching: false,
  }),
  useSaveCliproxyApiConfig: () => ({ mutate: mockSaveMutate, isPending: false }),
  useTestCliproxyApiConnection: () => ({
    mutate: mockTestMutate,
    mutateAsync: mockTestMutateAsync,
    isPending: false,
  }),
  useStartCliproxyApiOauth: () => ({ mutateAsync: mockStartOauth, isPending: false }),
  useUpdateCliproxyApiAccount: () => ({ mutate: mockUpdateAccount, isPending: false }),
  useBuildCliproxyApiAccountPreset: () => ({ mutateAsync: mockBuildPreset, isPending: false }),
}));

describe("CliproxyApiPage", () => {
  beforeEach(() => {
    mockSaveMutate.mockReset();
    mockTestMutate.mockReset();
    mockTestMutateAsync.mockReset();
    mockStartOauth.mockReset();
    mockUpdateAccount.mockReset();
    mockBuildPreset.mockReset();
    mockRefetchAccounts.mockReset();
    mockConfigData.items[0].last_status = "success";
    vi.spyOn(window, "open").mockImplementation(() => null);
    mockStartOauth.mockResolvedValue({
      provider: "codex",
      status: "pending",
      auth_url: "https://oauth.example/login",
      device_code: "ABCD",
      expires_at: "2026-01-01T00:10:00.000Z",
      message: null,
    });
    mockTestMutateAsync.mockResolvedValue({
      result: {
        endpoint: "management",
        ok: true,
        status_code: 200,
        latency_ms: 10,
        message: "Connection succeeded",
        tested_at: "2026-01-01T00:00:00.000Z",
      },
    });
    mockBuildPreset.mockResolvedValue({ name: "CLIProxyAPI codex.json Account" });
  });

  it("saves connection edits through the CLIProxyAPI hook", () => {
    render(<CliproxyApiPage />);

    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Renamed CPA" } });
    fireEvent.click(screen.getByText("saveConnection"));

    expect(mockSaveMutate).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed CPA" }));
  });

  it("opens OAuth URL and displays returned status fields", async () => {
    render(<CliproxyApiPage />);

    fireEvent.click(screen.getByRole("button", { name: "provider.codex" }));

    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith(
        "https://oauth.example/login",
        "_blank",
        "noopener,noreferrer"
      )
    );
    expect(screen.getByText("oauthResult:provider.codex:pending")).toBeInTheDocument();
    expect(screen.getByText("deviceCode:ABCD")).toBeInTheDocument();
  });

  it("renders OAuth request failures without throwing a runtime error", async () => {
    mockStartOauth.mockRejectedValueOnce(new Error("management endpoint returned 404"));

    render(<CliproxyApiPage />);

    fireEvent.click(screen.getByRole("button", { name: "provider.codex" }));

    expect(await screen.findByText("oauthResult:provider.codex:failed")).toBeInTheDocument();
    expect(screen.getByText("management endpoint returned 404")).toHaveClass("text-status-error");
  });

  it("shows separate management status and disables OAuth when management is unavailable", async () => {
    mockTestMutateAsync.mockResolvedValueOnce({
      result: {
        endpoint: "management",
        ok: false,
        status_code: 404,
        latency_ms: 12,
        message: "Management endpoint returned 404",
        tested_at: "2026-01-01T00:00:00.000Z",
      },
    });

    render(<CliproxyApiPage />);

    expect(screen.getByText("connectionChecksTitle")).toBeInTheDocument();

    fireEvent.click(screen.getByText("testEndpoint.management"));

    expect(await screen.findByText("statusUnavailable")).toHaveClass("text-status-error");
    expect(screen.getByText("managementUnavailableHint")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "provider.codex" })).toBeDisabled();
  });

  it("builds a fixed-account upstream preset from account models", async () => {
    render(<CliproxyApiPage />);

    fireEvent.click(screen.getByText("createAccountUpstream"));

    await waitFor(() => {
      expect(mockBuildPreset).toHaveBeenCalledWith({
        connection_id: "conn-1",
        provider: "codex",
        account_name: "codex.json",
        account_prefix: "main",
        models: ["gpt-5-codex"],
      });
    });
    expect(await screen.findByTestId("upstream-dialog")).toHaveTextContent(
      "CLIProxyAPI codex.json Account"
    );
  });
});
