import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StateChip } from "@/components/ui/state-chip";

describe("StateChip", () => {
  it("renders CLOSED with success tone and no pulse", () => {
    const { container } = render(<StateChip state="closed" />);
    const chip = screen.getByText("CLOSED");
    expect(chip).toHaveClass("text-status-success");
    expect(container.querySelector('[data-tone="ok"]')).not.toHaveClass("animate-led-breathe");
  });

  it("renders HALF with warning tone and a breathing led", () => {
    const { container } = render(<StateChip state="half_open" />);
    const chip = screen.getByText("HALF");
    expect(chip).toHaveClass("text-status-warning");
    expect(container.querySelector('[data-tone="warn"]')).toHaveClass("animate-led-breathe");
  });

  it("renders OPEN with error tone", () => {
    const { container } = render(<StateChip state="open" />);
    const chip = screen.getByText("OPEN");
    expect(chip).toHaveClass("text-status-error");
    expect(container.querySelector('[data-tone="bad"]')).toBeTruthy();
  });

  it("accepts a custom label while keeping the state styling", () => {
    render(<StateChip state="open" label="OFFLINE" />);
    const chip = screen.getByText("OFFLINE");
    expect(chip).toHaveClass("text-status-error");
    expect(chip).toHaveAttribute("data-state", "open");
  });
});
