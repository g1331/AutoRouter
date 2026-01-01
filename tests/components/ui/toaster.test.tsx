import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";

// Mock sonner
vi.mock("sonner", () => ({
  Toaster: ({
    className,
    theme,
    toastOptions,
    ...props
  }: {
    className?: string;
    theme?: string;
    toastOptions?: object;
  }) => (
    <div
      data-testid="toaster"
      data-theme={theme}
      className={className}
      data-toast-options={JSON.stringify(toastOptions)}
      {...props}
    />
  ),
}));

describe("Toaster", () => {
  it("renders the toaster component", () => {
    const { getByTestId } = render(<Toaster />);

    expect(getByTestId("toaster")).toBeInTheDocument();
  });

  it("uses dark theme", () => {
    const { getByTestId } = render(<Toaster />);

    expect(getByTestId("toaster")).toHaveAttribute("data-theme", "dark");
  });

  it("has toaster group class", () => {
    const { getByTestId } = render(<Toaster />);

    expect(getByTestId("toaster")).toHaveClass("toaster", "group");
  });

  it("passes custom props", () => {
    const { getByTestId } = render(<Toaster data-custom="test" />);

    expect(getByTestId("toaster")).toHaveAttribute("data-custom", "test");
  });
});
