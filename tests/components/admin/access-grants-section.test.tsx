import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { AccessGrantsSection } from "@/components/admin/key/sections/access-grants-section";
import { buildAccessGrantsPayload } from "@/components/admin/key/section-payloads";
import { apiKeySectionSchemas } from "@/components/admin/key/section-schemas";
import type { APIKeyResponse, Upstream } from "@/types/api";

// next-intl: stable, predictable strings — "<namespace>.<key>" or with a JSON-encoded
// vars suffix, matching the idiom already used across this repo's component tests.
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${namespace}.${key}:${JSON.stringify(vars)}` : `${namespace}.${key}`,
}));

const { mockMutate, mockUseAllUpstreams } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockUseAllUpstreams: vi.fn(),
}));

vi.mock("@/hooks/use-api-keys", () => ({
  useUpdateApiKeySection: () => ({ mutate: mockMutate, isPending: false }),
}));

vi.mock("@/hooks/use-upstreams", () => ({
  useAllUpstreams: mockUseAllUpstreams,
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

function makeUpstream(overrides: Partial<Upstream> = {}): Upstream {
  return {
    id: "up-1",
    name: "Upstream One",
    base_url: "https://api.example.com",
    official_website_url: null,
    description: null,
    api_key_masked: "sk-***1234",
    is_default: false,
    timeout: 30,
    is_active: true,
    weight: 1,
    priority: 1,
    route_capabilities: [],
    allowed_models: null,
    model_redirects: null,
    model_discovery: null,
    model_catalog: null,
    model_catalog_updated_at: null,
    model_catalog_last_status: null,
    model_catalog_last_error: null,
    model_catalog_last_failed_at: null,
    model_rules: null,
    affinity_migration: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  } as Upstream;
}

// Deliberately crafted so searching "pool" (present only in the first two
// descriptions) matches exactly two of the three fixtures and excludes "Backup
// Gateway" (no description) — used by the select/deselect-filtered test below.
const upstreamsFixture: Upstream[] = [
  makeUpstream({ id: "up-1", name: "Production OpenAI", description: "gpt-4 primary pool" }),
  makeUpstream({ id: "up-2", name: "Staging Claude", description: "claude staging pool" }),
  makeUpstream({ id: "up-3", name: "Backup Gateway", description: null }),
];

function getModeCard(name: string): HTMLElement {
  return screen.getByText(name).closest("button") as HTMLElement;
}

function getUpstreamPickerWrapper(): HTMLElement {
  const search = screen.getByLabelText("keys.searchUpstreams");
  return search.closest(".overflow-hidden")!.parentElement as HTMLElement;
}

describe("AccessGrantsSection", () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockUseAllUpstreams.mockReset();
    mockUseAllUpstreams.mockReturnValue({ data: upstreamsFixture, isLoading: false });
  });

  it("defaults to the unrestricted card selected and collapses the upstream picker", () => {
    render(<AccessGrantsSection apiKey={makeApiKey()} />);

    expect(getModeCard("keys.unrestrictedAccess")).toHaveClass("border-primary");
    expect(getModeCard("keys.restrictedAccess")).not.toHaveClass("border-primary");
    expect(getUpstreamPickerWrapper()).toHaveClass("grid-rows-[0fr]");
  });

  it("switching to restricted selects that card and expands the upstream picker", () => {
    render(<AccessGrantsSection apiKey={makeApiKey()} />);

    fireEvent.click(getModeCard("keys.restrictedAccess"));

    expect(getModeCard("keys.restrictedAccess")).toHaveClass("border-primary");
    expect(getModeCard("keys.unrestrictedAccess")).not.toHaveClass("border-primary");
    expect(getUpstreamPickerWrapper()).toHaveClass("grid-rows-[1fr]");
  });

  it("filters the upstream list by name and description", () => {
    render(<AccessGrantsSection apiKey={makeApiKey()} />);

    fireEvent.change(screen.getByLabelText("keys.searchUpstreams"), {
      target: { value: "staging" },
    });

    expect(screen.getByRole("checkbox", { name: "Staging Claude" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Production OpenAI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Backup Gateway" })).not.toBeInTheDocument();

    // Matches on description text too, not just name.
    fireEvent.change(screen.getByLabelText("keys.searchUpstreams"), {
      target: { value: "gpt-4" },
    });
    expect(screen.getByRole("checkbox", { name: "Production OpenAI" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Staging Claude" })).not.toBeInTheDocument();
  });

  it("shows the no-match state when the search filters out every upstream", () => {
    render(<AccessGrantsSection apiKey={makeApiKey()} />);

    fireEvent.change(screen.getByLabelText("keys.searchUpstreams"), {
      target: { value: "zzz-no-such-upstream" },
    });

    expect(screen.getByText("keys.noMatchingUpstreams")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows the loading indicator instead of the list while upstreams are loading", () => {
    mockUseAllUpstreams.mockReturnValue({ data: undefined, isLoading: true });
    render(<AccessGrantsSection apiKey={makeApiKey()} />);

    expect(screen.getByText("common.loading")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows the no-data state when there are no upstreams at all", () => {
    mockUseAllUpstreams.mockReturnValue({ data: [], isLoading: false });
    render(<AccessGrantsSection apiKey={makeApiKey()} />);

    expect(screen.getByText("common.noData")).toBeInTheDocument();
  });

  it("select/deselect-filtered toggles ids for only the currently filtered upstreams", () => {
    render(<AccessGrantsSection apiKey={makeApiKey()} />);

    fireEvent.change(screen.getByLabelText("keys.searchUpstreams"), { target: { value: "pool" } });
    // Filtered set is Production OpenAI + Staging Claude (see fixture comment above).
    expect(
      screen.getByText(
        `keys.filteredUpstreamsSelected:${JSON.stringify({ selected: 0, total: 2 })}`
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "keys.selectFilteredUpstreams" }));

    expect(screen.getByRole("checkbox", { name: "Production OpenAI" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Staging Claude" })).toBeChecked();
    expect(
      screen.getByRole("button", { name: "keys.deselectFilteredUpstreams" })
    ).toBeInTheDocument();

    // Clearing the search reveals Backup Gateway was never touched.
    fireEvent.change(screen.getByLabelText("keys.searchUpstreams"), { target: { value: "" } });
    expect(screen.getByRole("checkbox", { name: "Backup Gateway" })).not.toBeChecked();

    fireEvent.change(screen.getByLabelText("keys.searchUpstreams"), { target: { value: "pool" } });
    fireEvent.click(screen.getByRole("button", { name: "keys.deselectFilteredUpstreams" }));

    expect(screen.getByRole("checkbox", { name: "Production OpenAI" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Staging Claude" })).not.toBeChecked();
  });

  it("toggles an individual upstream checkbox independently of the others", () => {
    render(<AccessGrantsSection apiKey={makeApiKey()} />);

    const checkbox = screen.getByRole("checkbox", { name: "Production OpenAI" });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Staging Claude" })).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("blocks save and shows the localized required error when restricted has zero upstreams selected", async () => {
    render(<AccessGrantsSection apiKey={makeApiKey({ access_mode: "unrestricted" })} />);

    fireEvent.click(getModeCard("keys.restrictedAccess"));
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(await screen.findByText("keys.selectUpstreamsRequired")).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("calls mutate with the buildAccessGrantsPayload shape for a valid restricted selection", async () => {
    render(<AccessGrantsSection apiKey={makeApiKey({ access_mode: "unrestricted" })} />);

    fireEvent.click(getModeCard("keys.restrictedAccess"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Production OpenAI" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Staging Claude" }));
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    const expectedValues = apiKeySectionSchemas["access-grants"].parse({
      access_mode: "restricted",
      upstream_ids: ["up-1", "up-2"],
    });

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { id: "key-1", payload: buildAccessGrantsPayload(expectedValues) },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
    });
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { access_mode: "restricted", upstream_ids: ["up-1", "up-2"] },
      }),
      expect.anything()
    );
  });

  it("clears upstream_ids in the saved payload when switching an already-restricted key to unrestricted", async () => {
    render(
      <AccessGrantsSection
        apiKey={makeApiKey({ access_mode: "restricted", upstream_ids: ["up-1"] })}
      />
    );

    fireEvent.click(getModeCard("keys.unrestrictedAccess"));
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { id: "key-1", payload: { access_mode: "unrestricted", upstream_ids: [] } },
        expect.anything()
      );
    });
  });
});
