import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Wallet } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";

describe("StatCard", () => {
  it("renders the label and value", () => {
    render(<StatCard icon={Wallet} label="Requests" value="1,234" />);

    expect(screen.getByText("Requests")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("renders the hint when provided", () => {
    render(<StatCard icon={Wallet} label="Requests" value="1,234" hint="last 24h" />);

    expect(screen.getByText("last 24h")).toBeInTheDocument();
  });

  it("omits the hint when not provided", () => {
    render(<StatCard icon={Wallet} label="Requests" value="1,234" />);

    expect(screen.queryByText("last 24h")).not.toBeInTheDocument();
  });

  it("renders a loading skeleton instead of the value when isLoading is set", () => {
    const { container } = render(
      <StatCard icon={Wallet} label="Requests" value="1,234" isLoading />
    );

    expect(screen.queryByText("1,234")).not.toBeInTheDocument();
    expect(container.querySelector('[class*="animate-pulse"]')).toBeInTheDocument();
  });

  it("carries the Tier-1 typography contract on the value element", () => {
    render(<StatCard icon={Wallet} label="Requests" value="1,234" />);

    const value = screen.getByText("1,234");
    expect(value).toHaveClass("type-display-small");
    expect(value).toHaveClass("tabular-nums");
  });
});
