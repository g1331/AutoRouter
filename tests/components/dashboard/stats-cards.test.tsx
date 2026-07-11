import { render, screen } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { StatsCards } from "@/components/dashboard/stats-cards";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// KPI 卡 sparkline 通过 useStatsTimeseries 自取数据；mock 掉该 hook，
// 组件测试无需 QueryClient / AuthProvider。
const useStatsTimeseriesMock = vi.fn();
vi.mock("@/hooks/use-dashboard-stats", () => ({
  useStatsTimeseries: (...args: unknown[]) => useStatsTimeseriesMock(...args),
}));

beforeEach(() => {
  useStatsTimeseriesMock.mockReturnValue({ data: undefined });
});

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Activity: () => <svg data-testid="activity-icon" />,
  Clock: () => <svg data-testid="clock-icon" />,
  Zap: () => <svg data-testid="zap-icon" />,
  Timer: () => <svg data-testid="timer-icon" />,
  Database: () => <svg data-testid="database-icon" />,
  DollarSign: () => <svg data-testid="dollar-sign-icon" />,
  TrendingUp: () => <svg data-testid="trending-up-icon" />,
  TrendingDown: () => <svg data-testid="trending-down-icon" />,
}));

const defaultProps = {
  todayRequests: 0,
  avgResponseTimeMs: 0,
  totalTokensToday: 0,
  totalCostToday: 0,
  avgTtftMs: 0,
  cacheHitRate: 0,
  yesterdayRequests: 0,
  yesterdayTotalTokens: 0,
  yesterdayCostUsd: 0,
  yesterdayAvgResponseTimeMs: 0,
  yesterdayAvgTtftMs: 0,
  yesterdayCacheHitRate: 0,
  isLoading: false,
};

describe("StatsCards", () => {
  describe("Loading State", () => {
    it("renders skeletons when loading", () => {
      render(<StatsCards {...defaultProps} isLoading={true} />);

      const skeletons = screen.getAllByTestId("dashboard-stat-value-loading");
      expect(skeletons.length).toBe(6);
      expect(screen.queryByText("---")).not.toBeInTheDocument();
    });

    it("renders stat labels when loading", () => {
      render(<StatsCards {...defaultProps} isLoading={true} />);

      expect(screen.getByText("stats.todayRequests")).toBeInTheDocument();
      expect(screen.getByText("stats.avgResponseTime")).toBeInTheDocument();
      expect(screen.getByText("stats.totalTokens")).toBeInTheDocument();
      expect(screen.getByText("stats.avgTtft")).toBeInTheDocument();
      expect(screen.getByText("stats.cacheHitRate")).toBeInTheDocument();
    });
  });

  describe("Loaded State", () => {
    it("renders formatted requests count", () => {
      render(
        <StatsCards
          {...defaultProps}
          todayRequests={1234}
          avgResponseTimeMs={250}
          totalTokensToday={50000}
        />
      );

      expect(screen.getByText("1.2K")).toBeInTheDocument();
    });

    it("renders formatted response time in ms", () => {
      render(
        <StatsCards
          {...defaultProps}
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={5000}
        />
      );

      expect(screen.getByText("250ms")).toBeInTheDocument();
    });

    it("renders formatted response time in seconds", () => {
      render(
        <StatsCards
          {...defaultProps}
          todayRequests={100}
          avgResponseTimeMs={1500}
          totalTokensToday={5000}
        />
      );

      expect(screen.getByText("1.5s")).toBeInTheDocument();
    });

    it("renders formatted tokens count", () => {
      render(
        <StatsCards
          {...defaultProps}
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={1500000}
        />
      );

      expect(screen.getByText("1.5M")).toBeInTheDocument();
    });

    it("renders small numbers without formatting", () => {
      render(
        <StatsCards
          {...defaultProps}
          todayRequests={42}
          avgResponseTimeMs={50}
          totalTokensToday={999}
        />
      );

      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("50ms")).toBeInTheDocument();
      expect(screen.getByText("999")).toBeInTheDocument();
    });

    it("formats TTFT over 1000ms as seconds with three decimals", () => {
      render(
        <StatsCards
          {...defaultProps}
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={5000}
          avgTtftMs={1222}
        />
      );

      const ttft = screen.getByText("1.222s");
      expect(ttft).toBeInTheDocument();
      expect(ttft.className).toContain("text-status-error");
    });

    it("applies success color for fast TTFT", () => {
      render(
        <StatsCards
          {...defaultProps}
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={5000}
          avgTtftMs={220}
        />
      );

      const ttft = screen.getByText("220ms");
      expect(ttft).toBeInTheDocument();
      expect(ttft.className).toContain("text-status-success");
    });

    it("renders cache hit rate with two decimals when value is zero", () => {
      render(
        <StatsCards
          {...defaultProps}
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={5000}
          cacheHitRate={0}
        />
      );

      expect(screen.getByText("0.00%")).toBeInTheDocument();
    });

    it("rounds cache hit rate to two decimals", () => {
      render(
        <StatsCards
          {...defaultProps}
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={5000}
          cacheHitRate={12.345}
        />
      );

      expect(screen.getByText("12.35%")).toBeInTheDocument();
    });

    it("renders percent unit for cache hit rate card", () => {
      render(
        <StatsCards
          {...defaultProps}
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={5000}
          cacheHitRate={12.345}
        />
      );

      expect(screen.getByText("12.35%")).toBeInTheDocument();
      expect(screen.getByText("%")).toBeInTheDocument();
    });
  });

  describe("Cost formatting", () => {
    it("renders zero cost as $0.00", () => {
      render(<StatsCards {...defaultProps} totalCostToday={0} />);

      expect(screen.getByText("$0.00")).toBeInTheDocument();
    });

    it("renders sub-cent cost with four decimals", () => {
      render(<StatsCards {...defaultProps} totalCostToday={0.006599} />);

      expect(screen.getByText("$0.0066")).toBeInTheDocument();
    });

    it("renders regular cost with two decimals", () => {
      render(<StatsCards {...defaultProps} totalCostToday={12.5} />);

      expect(screen.getByText("$12.50")).toBeInTheDocument();
    });

    it("abbreviates thousand-dollar cost with K suffix", () => {
      render(<StatsCards {...defaultProps} totalCostToday={1234.5} />);

      expect(screen.getByText("$1.23K")).toBeInTheDocument();
    });

    it("abbreviates million-dollar cost with M suffix", () => {
      render(<StatsCards {...defaultProps} totalCostToday={2_500_000} />);

      expect(screen.getByText("$2.50M")).toBeInTheDocument();
    });
  });

  describe("Icons", () => {
    it("renders activity icon for requests", () => {
      render(
        <StatsCards
          {...defaultProps}
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={5000}
        />
      );

      expect(screen.getByTestId("activity-icon")).toBeInTheDocument();
    });

    it("renders clock icon for response time", () => {
      render(
        <StatsCards
          {...defaultProps}
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={5000}
        />
      );

      expect(screen.getByTestId("clock-icon")).toBeInTheDocument();
    });

    it("renders zap icon for tokens", () => {
      render(
        <StatsCards
          {...defaultProps}
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={5000}
        />
      );

      expect(screen.getByTestId("zap-icon")).toBeInTheDocument();
    });
  });

  describe("Sparklines", () => {
    const timeseriesData = {
      total_series: [
        {
          timestamp: "2024-01-01T10:00:00Z",
          request_count: 10,
          total_tokens: 1000,
          avg_duration_ms: 100,
          total_cost: 0.1,
        },
        {
          timestamp: "2024-01-01T11:00:00Z",
          request_count: 20,
          total_tokens: 2000,
          avg_duration_ms: 120,
          total_cost: 0.2,
        },
      ],
    };

    it("renders a sparkline for the requests/tokens/cost cards", () => {
      useStatsTimeseriesMock.mockReturnValue({ data: timeseriesData });

      render(<StatsCards {...defaultProps} todayRequests={30} />);

      expect(screen.getAllByTestId("stat-sparkline")).toHaveLength(3);
      expect(useStatsTimeseriesMock).toHaveBeenCalledWith("today", "requests");
      expect(useStatsTimeseriesMock).toHaveBeenCalledWith("today", "tokens");
      expect(useStatsTimeseriesMock).toHaveBeenCalledWith("today", "cost");
    });

    it("skips sparklines while loading or when the series is missing", () => {
      useStatsTimeseriesMock.mockReturnValue({ data: timeseriesData });
      const { unmount } = render(<StatsCards {...defaultProps} isLoading={true} />);
      expect(screen.queryByTestId("stat-sparkline")).not.toBeInTheDocument();
      unmount();

      useStatsTimeseriesMock.mockReturnValue({ data: undefined });
      render(<StatsCards {...defaultProps} todayRequests={30} />);
      expect(screen.queryByTestId("stat-sparkline")).not.toBeInTheDocument();
    });
  });

  describe("TTFT alert variant", () => {
    it("marks the TTFT card as alert when TTFT crosses the error threshold", () => {
      const { container } = render(<StatsCards {...defaultProps} avgTtftMs={1222} />);

      expect(container.querySelectorAll("[data-alert]")).toHaveLength(1);
    });

    it("does not mark any card as alert for healthy TTFT", () => {
      const { container } = render(<StatsCards {...defaultProps} avgTtftMs={220} />);

      expect(container.querySelectorAll("[data-alert]")).toHaveLength(0);
    });
  });

  describe("Labels", () => {
    it("renders all stat labels", () => {
      render(
        <StatsCards
          {...defaultProps}
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={5000}
        />
      );

      expect(screen.getByText("stats.todayRequests")).toBeInTheDocument();
      expect(screen.getByText("stats.avgResponseTime")).toBeInTheDocument();
      expect(screen.getByText("stats.totalTokens")).toBeInTheDocument();
      expect(screen.getByText("stats.avgTtft")).toBeInTheDocument();
      expect(screen.getByText("stats.cacheHitRate")).toBeInTheDocument();
      expect(screen.getByText("stats.totalCost")).toBeInTheDocument();
    });
  });
});
