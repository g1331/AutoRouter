import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { PageShell } from "@/components/admin/page-shell";

describe("PageShell", () => {
  it("renders its children", () => {
    render(
      <PageShell>
        <p>content</p>
      </PageShell>
    );

    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("defaults to the 7xl max width", () => {
    const { container } = render(
      <PageShell>
        <p>content</p>
      </PageShell>
    );

    expect(container.firstElementChild).toHaveClass("max-w-7xl");
  });

  it.each([
    ["7xl", "max-w-7xl"],
    ["4xl", "max-w-4xl"],
    ["full", "max-w-full"],
  ] as const)("applies the %s max-width class", (maxWidth, expectedClass) => {
    const { container } = render(
      <PageShell maxWidth={maxWidth}>
        <p>content</p>
      </PageShell>
    );

    expect(container.firstElementChild).toHaveClass(expectedClass);
  });

  it("passes through a custom className alongside the width class", () => {
    const { container } = render(
      <PageShell className="custom-class">
        <p>content</p>
      </PageShell>
    );

    const shell = container.firstElementChild;
    expect(shell).toHaveClass("custom-class");
    expect(shell).toHaveClass("max-w-7xl");
  });
});
