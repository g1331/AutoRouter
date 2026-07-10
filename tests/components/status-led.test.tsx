import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusLed } from "@/components/ui/status-led";

describe("StatusLed", () => {
  it.each([
    ["ok", "bg-status-success"],
    ["warn", "bg-status-warning"],
    ["bad", "bg-status-error"],
    ["neutral", "bg-muted-foreground"],
  ] as const)("renders %s tone with its status color", (tone, expectedClass) => {
    const { container } = render(<StatusLed tone={tone} />);
    const led = container.firstElementChild as HTMLElement;
    expect(led).toHaveClass(expectedClass);
    expect(led).toHaveAttribute("data-tone", tone);
  });

  it("is decorative and hidden from assistive tech", () => {
    const { container } = render(<StatusLed tone="ok" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("does not animate by default", () => {
    const { container } = render(<StatusLed tone="ok" />);
    expect(container.firstElementChild).not.toHaveClass("animate-led-breathe");
  });

  it("breathes when pulse is set, with a reduced-motion escape hatch", () => {
    const { container } = render(<StatusLed tone="ok" pulse />);
    const led = container.firstElementChild as HTMLElement;
    expect(led).toHaveClass("animate-led-breathe");
    expect(led).toHaveClass("motion-reduce:animate-none");
  });
});
