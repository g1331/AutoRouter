import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Separator } from "@/components/ui/separator";

describe("Separator", () => {
  it("renders a separator element", () => {
    render(<Separator data-testid="separator" />);

    expect(screen.getByTestId("separator")).toBeInTheDocument();
  });

  it("has horizontal orientation by default", () => {
    render(<Separator data-testid="separator" />);

    const separator = screen.getByTestId("separator");
    expect(separator).toHaveClass("h-px", "w-full");
  });

  it("supports vertical orientation", () => {
    render(<Separator orientation="vertical" data-testid="separator" />);

    const separator = screen.getByTestId("separator");
    expect(separator).toHaveClass("h-full", "w-px");
  });

  it("applies custom className", () => {
    render(<Separator className="custom-class" data-testid="separator" />);

    const separator = screen.getByTestId("separator");
    expect(separator).toHaveClass("custom-class");
  });

  it("is decorative by default", () => {
    render(<Separator data-testid="separator" />);

    const separator = screen.getByTestId("separator");
    expect(separator).toHaveAttribute("data-orientation", "horizontal");
  });
});
