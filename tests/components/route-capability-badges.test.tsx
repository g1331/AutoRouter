import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RouteCapabilityBadge,
  RouteCapabilityBadges,
  RouteCapabilityMultiSelect,
} from "@/components/admin/route-capability-badges";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("RouteCapabilityBadge", () => {
  it("should render known capability label and icon", () => {
    render(<RouteCapabilityBadge capability="openai_chat_compatible" />);

    expect(screen.getByText("capabilityOpenAIChatCompatible")).toBeInTheDocument();
    expect(screen.getByLabelText("OpenAI")).toBeInTheDocument();
  });

  it("should fallback to unknown capability text and generic icon", () => {
    const { container } = render(<RouteCapabilityBadge capability="unknown_capability" />);

    expect(screen.getByText("unknown_capability")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

describe("RouteCapabilityBadges", () => {
  it("should render nothing when capabilities are empty", () => {
    const { container } = render(<RouteCapabilityBadges capabilities={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("allows capability badges to wrap instead of clipping on narrow screens", () => {
    const { container } = render(
      <RouteCapabilityBadges
        capabilities={[
          "openai_chat_compatible",
          "codex_cli_responses",
          "openai_responses",
          "anthropic_messages",
        ]}
      />
    );

    const badgeList = container.firstChild as HTMLElement;
    expect(badgeList.className).toContain("flex-wrap");
    expect(badgeList.className).toContain("overflow-visible");
    expect(badgeList.className).not.toContain("flex-nowrap");
    expect(badgeList.className).not.toContain("overflow-hidden");
  });
});

describe("RouteCapabilityMultiSelect", () => {
  it("should add capability on click", () => {
    const onChange = vi.fn();

    render(<RouteCapabilityMultiSelect selected={[]} onChange={onChange} />);

    fireEvent.click(screen.getByText("capabilityCodexCliResponses"));
    expect(onChange).toHaveBeenCalledWith(["codex_cli_responses"]);
  });

  it("should remove capability on click when already selected", () => {
    const onChange = vi.fn();

    render(<RouteCapabilityMultiSelect selected={["codex_cli_responses"]} onChange={onChange} />);

    fireEvent.click(screen.getByText("capabilityCodexCliResponses"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
