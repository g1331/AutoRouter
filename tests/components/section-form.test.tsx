import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { SectionForm } from "@/components/admin/section-form";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

describe("SectionForm", () => {
  it("renders the title, description, and children", () => {
    render(
      <SectionForm
        title="Routing"
        description="Configure upstream routing rules"
        isDirty={false}
        isSaving={false}
        onSave={vi.fn()}
        onReset={vi.fn()}
      >
        <input aria-label="field" />
      </SectionForm>
    );

    expect(screen.getByText("Routing")).toBeInTheDocument();
    expect(screen.getByText("Configure upstream routing rules")).toBeInTheDocument();
    expect(screen.getByLabelText("field")).toBeInTheDocument();
  });

  it("hides the dirty badge when isDirty is false", () => {
    render(
      <SectionForm
        title="Routing"
        isDirty={false}
        isSaving={false}
        onSave={vi.fn()}
        onReset={vi.fn()}
      >
        <input aria-label="field" />
      </SectionForm>
    );

    expect(screen.queryByText("common.unsavedChanges")).not.toBeInTheDocument();
  });

  it("shows the dirty badge when isDirty is true", () => {
    render(
      <SectionForm
        title="Routing"
        isDirty={true}
        isSaving={false}
        onSave={vi.fn()}
        onReset={vi.fn()}
      >
        <input aria-label="field" />
      </SectionForm>
    );

    expect(screen.getByText("common.unsavedChanges")).toBeInTheDocument();
  });

  it("disables both buttons when the form is not dirty", () => {
    render(
      <SectionForm
        title="Routing"
        isDirty={false}
        isSaving={false}
        onSave={vi.fn()}
        onReset={vi.fn()}
      >
        <input aria-label="field" />
      </SectionForm>
    );

    expect(screen.getByRole("button", { name: "common.reset" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled();
  });

  it("enables both buttons when dirty and not saving", () => {
    render(
      <SectionForm
        title="Routing"
        isDirty={true}
        isSaving={false}
        onSave={vi.fn()}
        onReset={vi.fn()}
      >
        <input aria-label="field" />
      </SectionForm>
    );

    expect(screen.getByRole("button", { name: "common.reset" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "common.save" })).toBeEnabled();
  });

  it("disables both buttons and shows the saving label while isSaving is true", () => {
    render(
      <SectionForm
        title="Routing"
        isDirty={true}
        isSaving={true}
        onSave={vi.fn()}
        onReset={vi.fn()}
      >
        <input aria-label="field" />
      </SectionForm>
    );

    expect(screen.getByRole("button", { name: "common.reset" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "common.saving" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "common.save" })).not.toBeInTheDocument();
  });

  it("calls onSave when the form is submitted", () => {
    const onSave = vi.fn((event: React.FormEvent) => event.preventDefault());
    const onReset = vi.fn();
    const { container } = render(
      <SectionForm
        title="Routing"
        isDirty={true}
        isSaving={false}
        onSave={onSave}
        onReset={onReset}
      >
        <input aria-label="field" />
      </SectionForm>
    );

    fireEvent.submit(container.querySelector("form")!);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onReset).not.toHaveBeenCalled();
  });

  it("calls onReset (not onSave) when the Reset button is clicked", () => {
    const onSave = vi.fn((event: React.FormEvent) => event.preventDefault());
    const onReset = vi.fn();
    render(
      <SectionForm
        title="Routing"
        isDirty={true}
        isSaving={false}
        onSave={onSave}
        onReset={onReset}
      >
        <input aria-label="field" />
      </SectionForm>
    );

    fireEvent.click(screen.getByRole("button", { name: "common.reset" }));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
