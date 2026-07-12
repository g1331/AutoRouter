import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { KeyModelAllowlistSection } from "@/components/admin/key-model-allowlist-section";

// next-intl: stable, predictable strings — "<namespace>.<key>" or with a JSON-encoded
// vars suffix, matching the idiom already used across this repo's component tests.
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${namespace}.${key}:${JSON.stringify(vars)}` : `${namespace}.${key}`,
}));

function renderSection(props: { value: string[]; candidates: string[] }) {
  const onChange = vi.fn();
  const view = render(
    <KeyModelAllowlistSection
      value={props.value}
      candidates={props.candidates}
      onChange={onChange}
    />
  );
  return { onChange, ...view };
}

// The current-models list renders a checkbox AND a remove button inside the same
// <label>, so — unlike the candidates list — a checkbox can't be reliably queried
// by accessible name alone. Scope to the row via its visible model-name text instead.
function getCurrentModelRow(model: string): HTMLElement {
  return screen.getByText(model).closest("label") as HTMLElement;
}

// A model already in `value` is rendered in BOTH the candidates section (filtered
// out, so absent) and the current-models section (present) — global role queries by
// name can't tell "absent from candidates" apart from "only in current models", so
// scope explicitly to the candidates section container.
function getCandidatesContainer(): HTMLElement {
  return screen
    .getByPlaceholderText("keys.searchModelCandidates")
    .closest(".space-y-3") as HTMLElement;
}

describe("KeyModelAllowlistSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the open badge and empty state when there are no allowed models or candidates", () => {
    renderSection({ value: [], candidates: [] });

    expect(screen.getByText("keys.allowedModelsOpen")).toBeInTheDocument();
    expect(screen.getByText("keys.allowedModelsEmpty")).toBeInTheDocument();
    expect(screen.getByText('keys.modelCandidatesSummary:{"count":0}')).toBeInTheDocument();
    expect(screen.getByText("keys.modelCandidatesEmpty")).toBeInTheDocument();
    expect(screen.queryByText(/newModelCandidatesSummary/)).not.toBeInTheDocument();
  });

  it("shows the limited badge and current-model rows when models are already allowed", () => {
    renderSection({ value: ["gpt-4", "gpt-4o"], candidates: [] });

    expect(screen.getByText('keys.allowedModelsLimited:{"count":2}')).toBeInTheDocument();
    expect(screen.queryByText("keys.allowedModelsEmpty")).not.toBeInTheDocument();
    expect(screen.getByText("gpt-4")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
  });

  it("shows allModelCandidatesImported when every candidate is already allowed", () => {
    renderSection({ value: ["gpt-4"], candidates: ["gpt-4"] });

    expect(screen.getByText("keys.allModelCandidatesImported")).toBeInTheDocument();
    expect(screen.queryByText(/newModelCandidatesSummary/)).not.toBeInTheDocument();
  });

  it("shows the newModelCandidatesSummary and lists candidates not yet allowed", () => {
    renderSection({ value: ["gpt-4"], candidates: ["gpt-4", "gpt-4o", "gpt-3.5-turbo"] });

    expect(screen.getByText('keys.newModelCandidatesSummary:{"count":2}')).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "gpt-4o" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "gpt-3.5-turbo" })).toBeInTheDocument();
    // gpt-4 is already allowed, so it must not appear in the candidates list — it's
    // still rendered as a current-model row elsewhere, so this must be scoped.
    expect(
      within(getCandidatesContainer()).queryByRole("checkbox", { name: "gpt-4" })
    ).not.toBeInTheDocument();
  });

  it("adds trimmed, comma-separated draft models, dedupes against existing value, and clears the draft input", () => {
    const { onChange } = renderSection({ value: ["gpt-4"], candidates: [] });

    const draftInput = screen.getByPlaceholderText("keys.allowedModelsPlaceholder");
    fireEvent.change(draftInput, {
      target: { value: "gpt-4o, gpt-4o,  , gpt-3.5-turbo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "keys.addAllowedModel" }));

    expect(onChange).toHaveBeenCalledWith(["gpt-4", "gpt-4o", "gpt-3.5-turbo"]);
    expect(draftInput).toHaveValue("");
  });

  it("adds draft models on Enter and does nothing for a blank draft", () => {
    const { onChange } = renderSection({ value: [], candidates: [] });

    const draftInput = screen.getByPlaceholderText("keys.allowedModelsPlaceholder");
    fireEvent.change(draftInput, { target: { value: "   " } });
    fireEvent.keyDown(draftInput, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(draftInput, { target: { value: "claude-3" } });
    fireEvent.keyDown(draftInput, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["claude-3"]);
  });

  it("filters candidates by search and shows noMatchingModelCandidates on no match", () => {
    renderSection({ value: [], candidates: ["alpha-1", "alpha-2", "beta-1"] });

    fireEvent.change(screen.getByPlaceholderText("keys.searchModelCandidates"), {
      target: { value: "alpha" },
    });
    expect(screen.getByRole("checkbox", { name: "alpha-1" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "alpha-2" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "beta-1" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("keys.searchModelCandidates"), {
      target: { value: "no-such-model" },
    });
    expect(screen.getByText("keys.noMatchingModelCandidates")).toBeInTheDocument();
  });

  it("selectVisibleModelCandidates only selects the filtered subset, not hidden ones", () => {
    renderSection({ value: [], candidates: ["alpha-1", "alpha-2", "beta-1"] });

    fireEvent.change(screen.getByPlaceholderText("keys.searchModelCandidates"), {
      target: { value: "alpha" },
    });
    fireEvent.click(screen.getByRole("button", { name: "keys.selectVisibleModelCandidates" }));
    expect(
      screen.getByText('keys.modelCandidateSelectionSummary:{"selected":2,"visible":2,"total":3}')
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("keys.searchModelCandidates"), {
      target: { value: "" },
    });
    expect(screen.getByRole("checkbox", { name: "alpha-1" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "alpha-2" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "beta-1" })).not.toBeChecked();
  });

  it("clearModelCandidateSelection resets selection and disables the import button", () => {
    renderSection({ value: [], candidates: ["alpha-1", "beta-1"] });

    fireEvent.click(screen.getByRole("checkbox", { name: "alpha-1" }));
    expect(
      screen.getByRole("button", { name: /importSelectedModelCandidates/ })
    ).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "keys.clearModelCandidateSelection" }));
    expect(screen.getByRole("checkbox", { name: "alpha-1" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /importSelectedModelCandidates/ })).toBeDisabled();
  });

  it("importSelectedModelCandidates merges selected candidates into value and clears selection", () => {
    const { onChange } = renderSection({
      value: ["gpt-4"],
      candidates: ["gpt-4", "gpt-4o", "gpt-3.5-turbo"],
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "gpt-4o" }));
    fireEvent.click(screen.getByRole("button", { name: /importSelectedModelCandidates/ }));

    expect(onChange).toHaveBeenCalledWith(["gpt-4", "gpt-4o"]);
    // Selection resets, so the import button goes back to disabled.
    expect(screen.getByRole("button", { name: /importSelectedModelCandidates/ })).toBeDisabled();
  });

  it("filters current allowed models by search and shows noMatchingAllowedModels on no match", () => {
    renderSection({ value: ["gpt-4", "gpt-4o", "claude-3"], candidates: [] });

    fireEvent.change(screen.getByPlaceholderText("keys.searchAllowedModels"), {
      target: { value: "gpt" },
    });
    expect(screen.getByText("gpt-4")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
    expect(screen.queryByText("claude-3")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("keys.searchAllowedModels"), {
      target: { value: "no-such-model" },
    });
    expect(screen.getByText("keys.noMatchingAllowedModels")).toBeInTheDocument();
  });

  it("removes a single allowed model via its row's remove button, wired with the model name", () => {
    const { onChange } = renderSection({ value: ["gpt-4", "gpt-4o"], candidates: [] });

    const row = getCurrentModelRow("gpt-4o");
    const removeButton = within(row).getByRole("button");
    expect(removeButton).toHaveAttribute(
      "aria-label",
      'keys.removeAllowedModel:{"model":"gpt-4o"}'
    );

    fireEvent.click(removeButton);
    expect(onChange).toHaveBeenCalledWith(["gpt-4"]);
  });

  it("selects visible current models, then bulk-removes only the selected ones", () => {
    const { onChange } = renderSection({
      value: ["gpt-4", "gpt-4o", "claude-3"],
      candidates: [],
    });

    fireEvent.change(screen.getByPlaceholderText("keys.searchAllowedModels"), {
      target: { value: "gpt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "keys.selectVisibleAllowedModels" }));
    expect(
      screen.getByText('keys.allowedModelSelectionSummary:{"selected":2,"visible":2,"total":3}')
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("keys.searchAllowedModels"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /removeSelectedAllowedModels/ }));

    expect(onChange).toHaveBeenCalledWith(["claude-3"]);
  });

  it("clearAllowedModelSelection resets the current-model selection", () => {
    renderSection({ value: ["gpt-4", "gpt-4o"], candidates: [] });

    const row = getCurrentModelRow("gpt-4");
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /removeSelectedAllowedModels/ })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "keys.clearAllowedModelSelection" }));
    expect(within(row).getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: /removeSelectedAllowedModels/ })).toBeDisabled();
  });
});
