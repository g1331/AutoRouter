import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { UsageChart } from "@/components/dashboard/usage-chart";
import type { StatsTimeseriesResponse } from "@/types/api";

const yAxisPropsSpy = vi.fn();

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock recharts - render as simple divs with data attributes for testing
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="area-chart" data-points={data.length}>
      {children}
    </div>
  ),
  Area: ({ name, dataKey }: { name: string; dataKey: unknown }) => (
    <div data-testid={`area-${name}`} data-key={typeof dataKey} />
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: (props: unknown) => {
    yAxisPropsSpy(props);
    return <div data-testid="y-axis" />;
  },
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: ({ content }: { content: React.ReactNode }) => (
    <div data-testid="tooltip">
      {React.isValidElement(content)
        ? React.cloneElement(content as React.ReactElement, {
            active: true,
            label: "mock-label",
            payload: [{ name: "OpenAI", value: 1222, color: "#f59e0b" }],
          })
        : content}
    </div>
  ),
  Legend: ({ content }: { content: React.ReactNode }) => <div data-testid="legend">{content}</div>,
}));

describe("UsageChart", () => {
  const mockTimeseriesData: StatsTimeseriesResponse = {
    range: "7d",
    granularity: "day",
    series: [
      {
        upstream_id: "1",
        upstream_name: "OpenAI",
        data: [
          {
            timestamp: "2024-01-01T00:00:00Z",
            request_count: 100,
            total_tokens: 5000,
            avg_duration_ms: 200,
          },
          {
            timestamp: "2024-01-02T00:00:00Z",
            request_count: 150,
            total_tokens: 7500,
            avg_duration_ms: 180,
          },
        ],
      },
      {
        upstream_id: "2",
        upstream_name: "Anthropic",
        data: [
          {
            timestamp: "2024-01-01T00:00:00Z",
            request_count: 80,
            total_tokens: 4000,
            avg_duration_ms: 220,
          },
          {
            timestamp: "2024-01-02T00:00:00Z",
            request_count: 120,
            total_tokens: 6000,
            avg_duration_ms: 190,
          },
        ],
      },
    ],
  };

  const mockHourlyData: StatsTimeseriesResponse = {
    range: "today",
    granularity: "hour",
    series: [
      {
        upstream_id: "1",
        upstream_name: "OpenAI",
        data: [
          {
            timestamp: "2024-01-01T10:00:00Z",
            request_count: 50,
            total_tokens: 2500,
            avg_duration_ms: 150,
          },
          {
            timestamp: "2024-01-01T11:00:00Z",
            request_count: 60,
            total_tokens: 3000,
            avg_duration_ms: 160,
          },
        ],
      },
    ],
  };

  describe("Loading State", () => {
    it("renders chart skeleton when loading", () => {
      render(<UsageChart data={undefined} isLoading={true} timeRange="7d" />);

      expect(screen.getByTestId("usage-chart-loading-skeleton")).toBeInTheDocument();
    });

    it("renders skeleton for total requests when loading", () => {
      render(<UsageChart data={undefined} isLoading={true} timeRange="7d" />);

      // Should have Skeleton components with Loading aria-label
      const skeletons = screen.getAllByRole("status", { name: "Loading" });
      // At least 2 skeletons for requests and tokens
      expect(skeletons.length).toBeGreaterThanOrEqual(2);
    });

    it("renders section headers when loading", () => {
      render(<UsageChart data={undefined} isLoading={true} timeRange="7d" />);

      expect(screen.getByText("stats.usageStatistics")).toBeInTheDocument();
      expect(screen.getByText("stats.usageDescription")).toBeInTheDocument();
    });

    it("does not use spinner animation in loading state", () => {
      const { container } = render(<UsageChart data={undefined} isLoading={true} timeRange="7d" />);

      const spinner = container.querySelector(".animate-spin");
      expect(spinner).not.toBeInTheDocument();
      expect(screen.getByTestId("usage-chart-loading-skeleton")).toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    it("renders no data message when data is empty", () => {
      const emptyData: StatsTimeseriesResponse = {
        range: "7d",
        granularity: "day",
        series: [],
      };

      render(<UsageChart data={emptyData} isLoading={false} timeRange="7d" />);

      expect(screen.getByText("stats.noData")).toBeInTheDocument();
    });

    it("renders no data message when data is undefined", () => {
      render(<UsageChart data={undefined} isLoading={false} timeRange="7d" />);

      expect(screen.getByText("stats.noData")).toBeInTheDocument();
    });

    it("shows zero totals when no data", () => {
      render(<UsageChart data={undefined} isLoading={false} timeRange="7d" />);

      // Should display "0" for totals
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBe(2); // requests and tokens
    });
  });

  describe("Data Rendering", () => {
    it("renders area chart when data is provided", () => {
      render(<UsageChart data={mockTimeseriesData} isLoading={false} timeRange="7d" />);

      expect(screen.getByTestId("area-chart")).toBeInTheDocument();
    });

    it("renders correct number of data points", () => {
      render(<UsageChart data={mockTimeseriesData} isLoading={false} timeRange="7d" />);

      const chart = screen.getByTestId("area-chart");
      // 2 unique timestamps
      expect(chart).toHaveAttribute("data-points", "2");
    });

    it("renders area for each upstream", () => {
      render(<UsageChart data={mockTimeseriesData} isLoading={false} timeRange="7d" />);

      expect(screen.getByTestId("area-OpenAI")).toBeInTheDocument();
      expect(screen.getByTestId("area-Anthropic")).toBeInTheDocument();
    });

    it("renders chart axes", () => {
      render(<UsageChart data={mockTimeseriesData} isLoading={false} timeRange="7d" />);

      expect(screen.getByTestId("x-axis")).toBeInTheDocument();
      expect(screen.getByTestId("y-axis")).toBeInTheDocument();
    });

    it("renders cartesian grid", () => {
      render(<UsageChart data={mockTimeseriesData} isLoading={false} timeRange="7d" />);

      expect(screen.getByTestId("cartesian-grid")).toBeInTheDocument();
    });

    it("renders tooltip and legend", () => {
      render(<UsageChart data={mockTimeseriesData} isLoading={false} timeRange="7d" />);

      expect(screen.getByTestId("tooltip")).toBeInTheDocument();
      expect(screen.getByTestId("legend")).toBeInTheDocument();
    });
  });

  describe("Totals Calculation", () => {
    it("calculates total requests correctly", () => {
      render(<UsageChart data={mockTimeseriesData} isLoading={false} timeRange="7d" />);

      // Total: 100 + 150 + 80 + 120 = 450
      expect(screen.getByText("450")).toBeInTheDocument();
    });

    it("calculates total tokens correctly", () => {
      render(<UsageChart data={mockTimeseriesData} isLoading={false} timeRange="7d" />);

      // Total tokens: 5000 + 7500 + 4000 + 6000 = 22500 -> 22.5K
      expect(screen.getByText("22.5K")).toBeInTheDocument();
    });

    it("formats large numbers with K suffix", () => {
      const largeData: StatsTimeseriesResponse = {
        range: "7d",
        granularity: "day",
        series: [
          {
            upstream_id: "1",
            upstream_name: "OpenAI",
            data: [
              {
                timestamp: "2024-01-01T00:00:00Z",
                request_count: 15000,
                total_tokens: 1500000,
                avg_duration_ms: 200,
              },
            ],
          },
        ],
      };

      render(<UsageChart data={largeData} isLoading={false} timeRange="7d" />);

      expect(screen.getByText("15.0K")).toBeInTheDocument();
      expect(screen.getByText("1.5M")).toBeInTheDocument();
    });
  });

  describe("Time Granularity", () => {
    it("handles hourly granularity data", () => {
      render(<UsageChart data={mockHourlyData} isLoading={false} timeRange="today" />);

      expect(screen.getByTestId("area-chart")).toBeInTheDocument();
      expect(screen.getByTestId("area-OpenAI")).toBeInTheDocument();
    });

    it("renders correct number of data points for hourly data", () => {
      render(<UsageChart data={mockHourlyData} isLoading={false} timeRange="today" />);

      const chart = screen.getByTestId("area-chart");
      expect(chart).toHaveAttribute("data-points", "2");
    });
  });

  describe("Header Section", () => {
    it("renders usage statistics title", () => {
      render(<UsageChart data={mockTimeseriesData} isLoading={false} timeRange="7d" />);

      expect(screen.getByText("stats.usageStatistics")).toBeInTheDocument();
    });

    it("renders usage description", () => {
      render(<UsageChart data={mockTimeseriesData} isLoading={false} timeRange="7d" />);

      expect(screen.getByText("stats.usageDescription")).toBeInTheDocument();
    });

    it("renders total requests label", () => {
      render(<UsageChart data={mockTimeseriesData} isLoading={false} timeRange="7d" />);

      expect(screen.getByText("stats.totalRequests")).toBeInTheDocument();
    });

    it("renders total tokens label", () => {
      render(<UsageChart data={mockTimeseriesData} isLoading={false} timeRange="7d" />);

      expect(screen.getByText("stats.totalTokensUsed")).toBeInTheDocument();
    });
  });

  describe("Single Upstream", () => {
    it("renders chart with single upstream", () => {
      const singleUpstream: StatsTimeseriesResponse = {
        range: "7d",
        granularity: "day",
        series: [
          {
            upstream_id: "1",
            upstream_name: "Claude",
            data: [
              {
                timestamp: "2024-01-01T00:00:00Z",
                request_count: 200,
                total_tokens: 10000,
                avg_duration_ms: 250,
              },
            ],
          },
        ],
      };

      render(<UsageChart data={singleUpstream} isLoading={false} timeRange="7d" />);

      expect(screen.getByTestId("area-Claude")).toBeInTheDocument();
      // Should not have other areas
      expect(screen.queryByTestId("area-OpenAI")).not.toBeInTheDocument();
    });
  });

  describe("ResponsiveContainer", () => {
    it("wraps chart in responsive container", () => {
      render(<UsageChart data={mockTimeseriesData} isLoading={false} timeRange="7d" />);

      expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
    });
  });

  describe("TTFT Unit Formatting", () => {
    it("formats TTFT ticks as seconds when value is >= 1000ms", () => {
      yAxisPropsSpy.mockClear();
      render(
        <UsageChart
          data={mockTimeseriesData}
          isLoading={false}
          timeRange="7d"
          metric="ttft"
          onMetricChange={vi.fn()}
        />
      );

      const yAxisProps = yAxisPropsSpy.mock.calls.at(-1)?.[0] as {
        tickFormatter?: (v: number) => string;
      };
      expect(yAxisProps.tickFormatter?.(1222)).toBe("1.222s");
      expect(screen.getByText(/1.222s/)).toBeInTheDocument();
    });

    it("formats TTFT ticks as milliseconds when value is < 1000ms", () => {
      yAxisPropsSpy.mockClear();
      render(
        <UsageChart
          data={mockTimeseriesData}
          isLoading={false}
          timeRange="7d"
          metric="ttft"
          onMetricChange={vi.fn()}
        />
      );

      const yAxisProps = yAxisPropsSpy.mock.calls.at(-1)?.[0] as {
        tickFormatter?: (v: number) => string;
      };
      expect(yAxisProps.tickFormatter?.(650)).toBe("650ms");
    });
  });

  describe("Metric Interaction", () => {
    it("calls onMetricChange when clicking metric tabs", () => {
      const onMetricChange = vi.fn();
      render(
        <UsageChart
          data={mockTimeseriesData}
          isLoading={false}
          timeRange="7d"
          metric="requests"
          onMetricChange={onMetricChange}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "stats.chartTabTtft" }));
      fireEvent.click(screen.getByRole("button", { name: "stats.chartTabTps" }));

      expect(onMetricChange).toHaveBeenNthCalledWith(1, "ttft");
      expect(onMetricChange).toHaveBeenNthCalledWith(2, "tps");
    });

    it("formats tooltip values for TPS metric with tok/s suffix", () => {
      render(
        <UsageChart
          data={mockTimeseriesData}
          isLoading={false}
          timeRange="7d"
          metric="tps"
          onMetricChange={vi.fn()}
        />
      );

      expect(screen.getByText(/tok\/s/)).toBeInTheDocument();
    });
  });
});
