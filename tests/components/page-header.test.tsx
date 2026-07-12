import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Rocket } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";

describe("PageHeader", () => {
  it("renders the title and description", () => {
    render(<PageHeader title="Upstreams" description="Manage upstream providers" />);

    expect(screen.getByText("Upstreams")).toBeInTheDocument();
    expect(screen.getByText("Manage upstream providers")).toBeInTheDocument();
  });

  it("omits the description paragraph when none is provided", () => {
    render(<PageHeader title="Upstreams" />);

    expect(screen.getByText("Upstreams")).toBeInTheDocument();
    expect(screen.queryByText("Manage upstream providers")).not.toBeInTheDocument();
  });

  it("renders the icon tile when an icon is provided", () => {
    const { container } = render(<PageHeader title="Upstreams" icon={Rocket} />);

    expect(container.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("omits the icon tile when no icon is provided", () => {
    const { container } = render(<PageHeader title="Upstreams" />);

    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders the actions slot", () => {
    render(<PageHeader title="Upstreams" actions={<button type="button">New</button>} />);

    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });

  it("omits the actions wrapper when no actions are provided", () => {
    const { container } = render(<PageHeader title="Upstreams" />);

    expect(container.querySelector("button")).not.toBeInTheDocument();
  });
});
