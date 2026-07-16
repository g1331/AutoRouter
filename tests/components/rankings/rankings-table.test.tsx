import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { RankingsTable } from "@/components/rankings/rankings-table";
import type { LeaderboardUpstreamItem, LeaderboardModelItem } from "@/types/api";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
    onClick,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
    onClick?: (event: React.MouseEvent) => void;
  }) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

function upstreamItem(overrides: Partial<LeaderboardUpstreamItem>): LeaderboardUpstreamItem {
  return {
    id: "up-1",
    name: "OpenAI",
    provider_type: "openai",
    request_count: 100,
    total_tokens: 5000,
    total_cost_usd: 2.5,
    avg_ttft_ms: 1200,
    avg_tps: 60,
    cache_hit_rate: 12.5,
    error_rate: 0,
    model_distribution: [{ name: "gpt-5", count: 80 }],
    ...overrides,
  };
}

const defaultWindow = { startIso: "2024-06-08T12:00:00.000Z" };

describe("RankingsTable", () => {
  it("renders ranked rows with metrics and ratio bars scaled to the leader", () => {
    const items = [
      upstreamItem({ id: "up-1", name: "OpenAI", request_count: 100 }),
      upstreamItem({ id: "up-2", name: "Claude", request_count: 50 }),
    ];

    render(
      <RankingsTable
        dimension="upstreams"
        items={items}
        isLoading={false}
        sortBy="requests"
        order="desc"
        onSortChange={vi.fn()}
        logsWindow={defaultWindow}
      />
    );

    const rows = screen.getAllByTestId("rankings-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("OpenAI")).toBeInTheDocument();
    expect(within(rows[0]).getByText("#1")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Claude")).toBeInTheDocument();

    // Leader fills 100% of the ratio bar; the second row fills 50%.
    expect(rows[0].style.background).toContain("100%");
    expect(rows[1].style.background).toContain("50%");
  });

  it("invokes onSortChange when a metric header is clicked", () => {
    const onSortChange = vi.fn();
    render(
      <RankingsTable
        dimension="upstreams"
        items={[upstreamItem({})]}
        isLoading={false}
        sortBy="requests"
        order="desc"
        onSortChange={onSortChange}
        logsWindow={defaultWindow}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /columns\.cost/ }));
    expect(onSortChange).toHaveBeenCalledWith("cost");
  });

  it("expands a row to show the distribution and a logs link with filters", () => {
    render(
      <RankingsTable
        dimension="upstreams"
        items={[upstreamItem({ id: "up-1" })]}
        isLoading={false}
        sortBy="requests"
        order="desc"
        onSortChange={vi.fn()}
        logsWindow={{ startIso: "2024-06-08T12:00:00.000Z", endIso: "2024-06-15T12:00:00.000Z" }}
      />
    );

    expect(screen.queryByTestId("rankings-detail-row")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("rankings-row"));

    const detail = screen.getByTestId("rankings-detail-row");
    expect(within(detail).getByText("gpt-5")).toBeInTheDocument();

    const link = within(detail).getByRole("link", { name: /viewLogs/ });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("upstream_id=up-1");
    expect(href).toContain("start_time=2024-06-08T12%3A00%3A00.000Z");
    expect(href).toContain("end_time=2024-06-15T12%3A00%3A00.000Z");

    // Clicking again collapses the row.
    fireEvent.click(screen.getByTestId("rankings-row"));
    expect(screen.queryByTestId("rankings-detail-row")).not.toBeInTheDocument();
  });

  it("uses the model filter param for the models dimension", () => {
    const item: LeaderboardModelItem = {
      model: "gpt-5",
      request_count: 10,
      total_tokens: 100,
      total_cost_usd: 1,
      avg_ttft_ms: 0,
      avg_tps: 0,
      cache_hit_rate: 0,
      error_rate: 0,
      upstream_distribution: [{ name: "OpenAI", count: 10 }],
    };

    render(
      <RankingsTable
        dimension="models"
        items={[item]}
        isLoading={false}
        sortBy="requests"
        order="desc"
        onSortChange={vi.fn()}
        logsWindow={defaultWindow}
      />
    );

    fireEvent.click(screen.getByTestId("rankings-row"));
    const link = screen.getByRole("link", { name: /viewLogs/ });
    expect(link.getAttribute("href")).toContain("model=gpt-5");
  });

  it("renders rank movement and the new-entry badge from comparison data", () => {
    const items = [
      upstreamItem({
        id: "up-1",
        name: "Climber",
        request_count: 100,
        comparison: { prev_rank: 3, prev_request_count: 50 },
      }),
      upstreamItem({
        id: "up-2",
        name: "Newcomer",
        request_count: 60,
        comparison: { prev_rank: null, prev_request_count: null },
      }),
    ];

    render(
      <RankingsTable
        dimension="upstreams"
        items={items}
        isLoading={false}
        sortBy="requests"
        order="desc"
        onSortChange={vi.fn()}
        logsWindow={defaultWindow}
      />
    );

    const rows = screen.getAllByTestId("rankings-row");
    // Rank 1 with prev_rank 3 → moved up 2, +100% requests.
    expect(within(rows[0]).getByText("2")).toBeInTheDocument();
    expect(within(rows[0]).getByText("+100.0%")).toBeInTheDocument();
    expect(within(rows[1]).getByText("newEntry")).toBeInTheDocument();
  });

  it("shows the empty state when there is no data", () => {
    render(
      <RankingsTable
        dimension="users"
        items={[]}
        isLoading={false}
        sortBy="requests"
        order="desc"
        onSortChange={vi.fn()}
        logsWindow={defaultWindow}
      />
    );

    expect(screen.getByText("empty")).toBeInTheDocument();
  });
});
