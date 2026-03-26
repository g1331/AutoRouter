import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { UsageChart } from "@/components/dashboard/usage-chart";
import type { StatsTimeseriesResponse } from "@/types/api";

const yAxisPropsSpy = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: "light",
  }),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <svg data-testid="area-chart" data-points={data.length} data-chart={JSON.stringify(data)}>
      {children}
    </svg>
  ),
  Area: ({ name, dataKey }: { name: string; dataKey: unknown }) => (
    <div data-testid={`area-${name}`} data-key={String(dataKey)} />
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
          avg_tps: 35,
        },
        {
          timestamp: "2024-01-02T00:00:00Z",
          request_count: 150,
          total_tokens: 7500,
          avg_duration_ms: 180,
          avg_tps: 42,
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
          avg_tps: 28,
        },
        {
          timestamp: "2024-01-02T00:00:00Z",
          request_count: 120,
          total_tokens: 6000,
          avg_duration_ms: 190,
          avg_tps: 33,
        },
      ],
    },
  ],
  total_series: [
    {
      timestamp: "2024-01-01T00:00:00Z",
      request_count: 180,
      total_tokens: 9000,
      avg_duration_ms: 209,
      avg_tps: 31,
    },
    {
      timestamp: "2024-01-02T00:00:00Z",
      request_count: 270,
      total_tokens: 13500,
      avg_duration_ms: 184,
      avg_tps: 38,
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
  total_series: [
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
};

function renderChart(overrides: Partial<React.ComponentProps<typeof UsageChart>> = {}) {
  const props: React.ComponentProps<typeof UsageChart> = {
    data: mockTimeseriesData,
    isLoading: false,
    timeRange: "7d",
    metric: "requests",
    onMetricChange: vi.fn(),
    displayMode: "byUpstream",
    onDisplayModeChange: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<UsageChart {...props} />),
    props,
  };
}

describe("UsageChart", () => {
  describe("loading and empty states", () => {
    it("renders chart skeleton and summary placeholders while loading", () => {
      renderChart({ data: undefined, isLoading: true });

      expect(screen.getByTestId("usage-chart-loading-skeleton")).toBeInTheDocument();
      expect(screen.getAllByTestId("usage-chart-summary-loading")).toHaveLength(2);
      expect(screen.getByText("stats.usageStatistics")).toBeInTheDocument();
    });

    it("renders no data message and zero totals when data is empty", () => {
      renderChart({
        data: {
          range: "7d",
          granularity: "day",
          series: [],
          total_series: [],
        },
      });

      expect(screen.getByText("stats.noData")).toBeInTheDocument();
      expect(screen.getAllByText("0")).toHaveLength(2);
    });
  });

  describe("chart rendering", () => {
    it("renders one area per upstream in by-upstream mode", () => {
      renderChart({ displayMode: "byUpstream" });

      expect(screen.getByTestId("area-OpenAI")).toBeInTheDocument();
      expect(screen.getByTestId("area-Anthropic")).toBeInTheDocument();
      expect(screen.getByTestId("area-chart")).toHaveAttribute("data-points", "2");
      expect(screen.getByTestId("x-axis")).toBeInTheDocument();
      expect(screen.getByTestId("y-axis")).toBeInTheDocument();
      expect(screen.getByTestId("cartesian-grid")).toBeInTheDocument();
      expect(screen.getByTestId("tooltip")).toBeInTheDocument();
      expect(screen.getByTestId("legend")).toBeInTheDocument();
    });

    it("renders hourly data correctly", () => {
      renderChart({ data: mockHourlyData, timeRange: "today" });

      expect(screen.getByTestId("area-chart")).toHaveAttribute("data-points", "2");
      expect(screen.getByTestId("area-OpenAI")).toBeInTheDocument();
    });

    it("renders total mode from total_series instead of per-upstream values", () => {
      renderChart({
        metric: "tps",
        displayMode: "total",
      });

      expect(screen.getByTestId("area-stats.chartModeTotal")).toBeInTheDocument();
      expect(screen.queryByTestId("area-OpenAI")).not.toBeInTheDocument();

      const chartData = JSON.parse(
        screen.getByTestId("area-chart").getAttribute("data-chart") ?? "[]"
      );
      expect(chartData).toEqual([
        {
          timestamp: "2024-01-01T00:00:00Z",
          formattedTime: "01/01",
          totalValue: 31,
        },
        {
          timestamp: "2024-01-02T00:00:00Z",
          formattedTime: "01/02",
          totalValue: 38,
        },
      ]);
    });
  });

  describe("summary values", () => {
    it("calculates total requests and tokens from total_series", () => {
      renderChart();

      expect(screen.getByText("450")).toBeInTheDocument();
      expect(screen.getByText("22.5K")).toBeInTheDocument();
    });

    it("formats large numbers with suffixes", () => {
      renderChart({
        data: {
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
          total_series: [
            {
              timestamp: "2024-01-01T00:00:00Z",
              request_count: 15000,
              total_tokens: 1500000,
              avg_duration_ms: 200,
            },
          ],
        },
      });

      expect(screen.getByText("15.0K")).toBeInTheDocument();
      expect(screen.getByText("1.5M")).toBeInTheDocument();
    });
  });

  describe("interaction", () => {
    it("calls onMetricChange when clicking metric tabs", () => {
      const onMetricChange = vi.fn();
      renderChart({ onMetricChange });

      fireEvent.click(screen.getByRole("button", { name: "stats.chartTabTtft" }));
      fireEvent.click(screen.getByRole("button", { name: "stats.chartTabTps" }));

      expect(onMetricChange).toHaveBeenNthCalledWith(1, "ttft");
      expect(onMetricChange).toHaveBeenNthCalledWith(2, "tps");
    });

    it("calls onDisplayModeChange with the next display mode", () => {
      const onDisplayModeChange = vi.fn();
      const { rerender, props } = renderChart({
        onDisplayModeChange,
        displayMode: "byUpstream",
      });

      fireEvent.click(screen.getByRole("button", { name: "stats.chartModeByUpstream" }));
      expect(onDisplayModeChange).toHaveBeenNthCalledWith(1, "total");

      rerender(
        <UsageChart {...props} displayMode="total" onDisplayModeChange={onDisplayModeChange} />
      );
      fireEvent.click(screen.getByRole("button", { name: "stats.chartModeTotal" }));
      expect(onDisplayModeChange).toHaveBeenNthCalledWith(2, "byUpstream");
    });
  });

  describe("metric formatting", () => {
    it("formats TTFT ticks as seconds for large values", () => {
      yAxisPropsSpy.mockClear();

      renderChart({ metric: "ttft" });

      const yAxisProps = yAxisPropsSpy.mock.calls.at(-1)?.[0] as {
        tickFormatter?: (value: number) => string;
      };
      expect(yAxisProps.tickFormatter?.(1222)).toBe("1.222s");
      expect(screen.getByText(/1.222s/)).toBeInTheDocument();
    });

    it("formats TTFT ticks as milliseconds for small values", () => {
      yAxisPropsSpy.mockClear();

      renderChart({ metric: "ttft" });

      const yAxisProps = yAxisPropsSpy.mock.calls.at(-1)?.[0] as {
        tickFormatter?: (value: number) => string;
      };
      expect(yAxisProps.tickFormatter?.(650)).toBe("650ms");
    });

    it("formats tooltip values for TPS metric with tok/s suffix", () => {
      renderChart({ metric: "tps" });

      expect(screen.getByText(/tok\/s/)).toBeInTheDocument();
    });
  });
});
