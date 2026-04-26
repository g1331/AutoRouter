import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PaginationControls } from "@/components/admin/pagination-controls";

const translations: Record<string, string> = {};

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => translations[key] ?? key,
}));

afterEach(() => {
  Object.keys(translations).forEach((key) => delete translations[key]);
});

describe("PaginationControls", () => {
  it("renders pagination copy, action content, and moves to adjacent pages", () => {
    const onPageChange = vi.fn();

    const { container } = render(
      <PaginationControls
        total={42}
        page={2}
        totalPages={5}
        onPageChange={onPageChange}
        actionPrefix={<button type="button">refresh</button>}
      />
    );

    expect(container).toHaveTextContent("items 42");
    expect(container).toHaveTextContent("page 2 of 5");
    expect(screen.getByRole("button", { name: "refresh" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "previousPage" }));
    fireEvent.click(screen.getByRole("button", { name: "nextPage" }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it("submits a direct page jump", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(<PaginationControls total={42} page={2} totalPages={5} onPageChange={onPageChange} />);

    const input = screen.getByRole("spinbutton", { name: "jumpToPageAria" });
    await user.clear(input);
    await user.type(input, "4");
    await user.click(screen.getByRole("button", { name: "goToPage" }));

    expect(onPageChange).toHaveBeenCalledWith(4);
    expect(input).toHaveValue(4);
  });

  it("clamps submitted page jumps to the available range", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(<PaginationControls total={42} page={2} totalPages={5} onPageChange={onPageChange} />);

    const input = screen.getByRole("spinbutton", { name: "jumpToPageAria" });
    await user.clear(input);
    await user.type(input, "99");
    await user.click(screen.getByRole("button", { name: "goToPage" }));

    expect(onPageChange).toHaveBeenCalledWith(5);
    expect(input).toHaveValue(5);
  });

  it("resets invalid page drafts on blur and submit", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(<PaginationControls total={42} page={3} totalPages={5} onPageChange={onPageChange} />);

    const input = screen.getByRole("spinbutton", { name: "jumpToPageAria" });
    await user.clear(input);
    expect(screen.getByRole("button", { name: "goToPage" })).toBeDisabled();

    fireEvent.blur(input);
    expect(input).toHaveValue(3);

    await user.clear(input);
    fireEvent.submit(input.closest("form")!);

    expect(input).toHaveValue(3);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("does not call onPageChange when a direct jump resolves to the current page", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(<PaginationControls total={42} page={2} totalPages={5} onPageChange={onPageChange} />);

    const input = screen.getByRole("spinbutton", { name: "jumpToPageAria" });
    await user.clear(input);
    await user.type(input, "2.9");
    fireEvent.submit(input.closest("form")!);

    expect(input).toHaveValue(2);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("updates the page draft when the current page changes and disables edge buttons", () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <PaginationControls total={42} page={1} totalPages={3} onPageChange={onPageChange} />
    );

    expect(screen.getByRole("button", { name: "previousPage" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "nextPage" })).toBeEnabled();
    expect(screen.getByRole("spinbutton", { name: "jumpToPageAria" })).toHaveValue(1);

    rerender(<PaginationControls total={42} page={3} totalPages={3} onPageChange={onPageChange} />);

    expect(screen.getByRole("button", { name: "previousPage" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "nextPage" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "jumpToPageAria" })).toHaveValue(3);
  });

  it("omits the page suffix when the translation is empty", () => {
    translations.pageSuffix = "";

    render(<PaginationControls total={42} page={2} totalPages={5} onPageChange={vi.fn()} />);

    expect(screen.queryByText("pageSuffix")).not.toBeInTheDocument();
  });
});
