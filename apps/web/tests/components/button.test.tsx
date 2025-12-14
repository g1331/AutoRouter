import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "@/components/ui/button";

/**
 * Button Component Tests
 *
 * Tests Cassette Futurism styling and accessibility.
 */
describe("Button", () => {
  it("renders with default variant", () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole("button", { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("bg-amber-500");
  });

  it("renders with primary variant", () => {
    render(<Button variant="primary">Primary</Button>);
    const button = screen.getByRole("button", { name: /primary/i });
    expect(button).toHaveClass("bg-amber-500");
  });

  it("renders with destructive variant", () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByRole("button", { name: /delete/i });
    expect(button).toHaveClass("bg-status-error");
  });

  it("renders disabled state", () => {
    render(<Button disabled>Disabled</Button>);
    const button = screen.getByRole("button", { name: /disabled/i });
    expect(button).toBeDisabled();
    expect(button).toHaveClass("disabled:bg-amber-700/30");
  });

  it("has focus-visible ring for accessibility", () => {
    render(<Button>Focusable</Button>);
    const button = screen.getByRole("button", { name: /focusable/i });
    expect(button).toHaveClass("focus-visible:ring-amber-500");
  });
});
