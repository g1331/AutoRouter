import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RouteCapabilityBadge,
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

describe("RouteCapabilityMultiSelect", () => {
  it("should add capability on click", () => {
    const onChange = vi.fn();

    render(<RouteCapabilityMultiSelect selected={[]} onChange={onChange} />);

    fireEvent.click(screen.getByText("capabilityCodexResponses"));
    expect(onChange).toHaveBeenCalledWith(["codex_responses"]);
  });

  it("should remove capability on click when already selected", () => {
    const onChange = vi.fn();

    render(<RouteCapabilityMultiSelect selected={["codex_responses"]} onChange={onChange} />);

    fireEvent.click(screen.getByText("capabilityCodexResponses"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
