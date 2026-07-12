import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { IconBox } from "@/components/ui/icon-box";

describe("IconBox", () => {
  it("renders its children", () => {
    const { getByText } = render(
      <IconBox>
        <span>icon</span>
      </IconBox>
    );

    expect(getByText("icon")).toBeInTheDocument();
  });

  it.each([
    ["sm", "h-7", "w-7"],
    ["md", "h-10", "w-10"],
  ] as const)("applies the %s size classes", (size, hClass, wClass) => {
    const { container } = render(
      <IconBox size={size}>
        <span>icon</span>
      </IconBox>
    );

    const box = container.firstElementChild as HTMLElement;
    expect(box).toHaveClass(hClass);
    expect(box).toHaveClass(wClass);
  });

  it("defaults to the sm size", () => {
    const { container } = render(
      <IconBox>
        <span>icon</span>
      </IconBox>
    );

    expect(container.firstElementChild).toHaveClass("h-7", "w-7");
  });

  it("defaults to the amber tone triple", () => {
    const { container } = render(
      <IconBox>
        <span>icon</span>
      </IconBox>
    );

    const box = container.firstElementChild as HTMLElement;
    expect(box).toHaveClass("border-amber-500/35", "bg-amber-500/10", "text-amber-500");
  });

  it("applies a status tone from the shared status-tone soft triple", () => {
    const { container } = render(
      <IconBox tone="error">
        <span>icon</span>
      </IconBox>
    );

    const box = container.firstElementChild as HTMLElement;
    expect(box).toHaveClass("border-status-error/40", "bg-status-error-muted", "text-status-error");
  });

  it("passes through a custom className", () => {
    const { container } = render(
      <IconBox className="custom-class">
        <span>icon</span>
      </IconBox>
    );

    expect(container.firstElementChild).toHaveClass("custom-class");
  });
});
