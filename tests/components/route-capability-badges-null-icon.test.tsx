import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/route-capabilities", () => ({
  ROUTE_CAPABILITY_DEFINITIONS: [
    {
      value: "mock_capability",
      labelKey: "capabilityMock",
      descriptionKey: "capabilityMockDesc",
      iconKey: null,
    },
  ],
}));

import { RouteCapabilityMultiSelect } from "@/components/admin/route-capability-badges";

describe("RouteCapabilityMultiSelect null icon fallback", () => {
  it("falls back to generic icon when iconKey is null", () => {
    const onChange = vi.fn();

    const { container } = render(<RouteCapabilityMultiSelect selected={[]} onChange={onChange} />);

    expect(screen.getByText("capabilityMock")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
