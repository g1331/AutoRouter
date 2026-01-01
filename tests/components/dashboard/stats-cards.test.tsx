import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StatsCards } from "@/components/dashboard/stats-cards";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Activity: () => <svg data-testid="activity-icon" />,
  Clock: () => <svg data-testid="clock-icon" />,
  Zap: () => <svg data-testid="zap-icon" />,
}));

describe("StatsCards", () => {
  describe("Loading State", () => {
    it("renders skeletons when loading", () => {
      render(
        <StatsCards todayRequests={0} avgResponseTimeMs={0} totalTokensToday={0} isLoading={true} />
      );

      // Should show skeleton placeholders
      const skeletons = screen.getAllByText("---");
      expect(skeletons.length).toBe(3);
    });

    it("renders stat labels when loading", () => {
      render(
        <StatsCards todayRequests={0} avgResponseTimeMs={0} totalTokensToday={0} isLoading={true} />
      );

      expect(screen.getByText("stats.todayRequests")).toBeInTheDocument();
      expect(screen.getByText("stats.avgResponseTime")).toBeInTheDocument();
      expect(screen.getByText("stats.totalTokens")).toBeInTheDocument();
    });
  });

  describe("Loaded State", () => {
    it("renders formatted requests count", () => {
      render(
        <StatsCards
          todayRequests={1234}
          avgResponseTimeMs={250}
          totalTokensToday={50000}
          isLoading={false}
        />
      );

      expect(screen.getByText("1.2K")).toBeInTheDocument();
    });

    it("renders formatted response time in ms", () => {
      render(
        <StatsCards
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={5000}
          isLoading={false}
        />
      );

      expect(screen.getByText("250ms")).toBeInTheDocument();
    });

    it("renders formatted response time in seconds", () => {
      render(
        <StatsCards
          todayRequests={100}
          avgResponseTimeMs={1500}
          totalTokensToday={5000}
          isLoading={false}
        />
      );

      expect(screen.getByText("1.5s")).toBeInTheDocument();
    });

    it("renders formatted tokens count", () => {
      render(
        <StatsCards
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={1500000}
          isLoading={false}
        />
      );

      expect(screen.getByText("1.5M")).toBeInTheDocument();
    });

    it("renders small numbers without formatting", () => {
      render(
        <StatsCards
          todayRequests={42}
          avgResponseTimeMs={50}
          totalTokensToday={999}
          isLoading={false}
        />
      );

      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("50ms")).toBeInTheDocument();
      expect(screen.getByText("999")).toBeInTheDocument();
    });
  });

  describe("Icons", () => {
    it("renders activity icon for requests", () => {
      render(
        <StatsCards
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={5000}
          isLoading={false}
        />
      );

      expect(screen.getByTestId("activity-icon")).toBeInTheDocument();
    });

    it("renders clock icon for response time", () => {
      render(
        <StatsCards
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={5000}
          isLoading={false}
        />
      );

      expect(screen.getByTestId("clock-icon")).toBeInTheDocument();
    });

    it("renders zap icon for tokens", () => {
      render(
        <StatsCards
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={5000}
          isLoading={false}
        />
      );

      expect(screen.getByTestId("zap-icon")).toBeInTheDocument();
    });
  });

  describe("Labels", () => {
    it("renders all stat labels", () => {
      render(
        <StatsCards
          todayRequests={100}
          avgResponseTimeMs={250}
          totalTokensToday={5000}
          isLoading={false}
        />
      );

      expect(screen.getByText("stats.todayRequests")).toBeInTheDocument();
      expect(screen.getByText("stats.avgResponseTime")).toBeInTheDocument();
      expect(screen.getByText("stats.totalTokens")).toBeInTheDocument();
      expect(screen.getByText("stats.requests")).toBeInTheDocument();
      expect(screen.getByText("stats.latency")).toBeInTheDocument();
      expect(screen.getByText("stats.tokens")).toBeInTheDocument();
    });
  });
});
