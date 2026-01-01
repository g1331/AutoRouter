import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LeaderboardSection } from "@/components/dashboard/leaderboard-section";
import type { StatsLeaderboardResponse } from "@/types/api";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Key: () => <svg data-testid="key-icon" />,
  Server: () => <svg data-testid="server-icon" />,
  Cpu: () => <svg data-testid="cpu-icon" />,
  Trophy: ({ className }: { className?: string }) => (
    <svg data-testid="trophy-icon" className={className} />
  ),
}));

describe("LeaderboardSection", () => {
  const mockData: StatsLeaderboardResponse = {
    api_keys: [
      { name: "Production Key", key_prefix: "sk-prod", request_count: 15000, total_tokens: 500000 },
      { name: "Dev Key", key_prefix: "sk-dev", request_count: 5000, total_tokens: 150000 },
      { name: "Test Key", key_prefix: "sk-test", request_count: 1000, total_tokens: 30000 },
    ],
    upstreams: [
      { name: "OpenAI", provider: "openai", request_count: 12000, total_tokens: 400000 },
      { name: "Anthropic", provider: "anthropic", request_count: 8000, total_tokens: 280000 },
    ],
    models: [
      { model: "gpt-4", request_count: 10000, total_tokens: 350000 },
      { model: "claude-3", request_count: 7000, total_tokens: 250000 },
      { model: "gpt-3.5-turbo", request_count: 3000, total_tokens: 80000 },
    ],
  };

  describe("Loading State", () => {
    it("renders loading state", () => {
      render(<LeaderboardSection data={undefined} isLoading={true} />);

      // Should render three tables with headers even in loading state
      expect(screen.getByText("stats.apiKeyRanking")).toBeInTheDocument();
      expect(screen.getByText("stats.upstreamRanking")).toBeInTheDocument();
      expect(screen.getByText("stats.modelRanking")).toBeInTheDocument();
    });

    it("renders section header when loading", () => {
      render(<LeaderboardSection data={undefined} isLoading={true} />);

      expect(screen.getByText("stats.leaderboard")).toBeInTheDocument();
    });

    it("renders all three table headers when loading", () => {
      render(<LeaderboardSection data={undefined} isLoading={true} />);

      expect(screen.getByText("stats.apiKeyRanking")).toBeInTheDocument();
      expect(screen.getByText("stats.upstreamRanking")).toBeInTheDocument();
      expect(screen.getByText("stats.modelRanking")).toBeInTheDocument();
    });
  });

  describe("Loaded State with Data", () => {
    it("renders API key rankings", () => {
      render(<LeaderboardSection data={mockData} isLoading={false} />);

      expect(screen.getByText("Production Key")).toBeInTheDocument();
      expect(screen.getByText("Dev Key")).toBeInTheDocument();
      expect(screen.getByText("Test Key")).toBeInTheDocument();
    });

    it("renders upstream rankings", () => {
      render(<LeaderboardSection data={mockData} isLoading={false} />);

      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
    });

    it("renders model rankings", () => {
      render(<LeaderboardSection data={mockData} isLoading={false} />);

      expect(screen.getByText("gpt-4")).toBeInTheDocument();
      expect(screen.getByText("claude-3")).toBeInTheDocument();
      expect(screen.getByText("gpt-3.5-turbo")).toBeInTheDocument();
    });

    it("renders rank badges with correct numbers", () => {
      render(<LeaderboardSection data={mockData} isLoading={false} />);

      // Should have multiple #1, #2, #3 badges for each table
      const rank1s = screen.getAllByText("#1");
      const rank2s = screen.getAllByText("#2");
      const rank3s = screen.getAllByText("#3");

      expect(rank1s.length).toBe(3); // One for each table
      expect(rank2s.length).toBe(3);
      expect(rank3s.length).toBe(2); // Models only has 3, upstreams has 2
    });

    it("renders formatted request counts", () => {
      render(<LeaderboardSection data={mockData} isLoading={false} />);

      expect(screen.getByText("15.0K")).toBeInTheDocument();
      expect(screen.getByText("12.0K")).toBeInTheDocument();
      expect(screen.getByText("10.0K")).toBeInTheDocument();
    });

    it("renders key prefixes as subtitles", () => {
      render(<LeaderboardSection data={mockData} isLoading={false} />);

      expect(screen.getByText("sk-prod")).toBeInTheDocument();
      expect(screen.getByText("sk-dev")).toBeInTheDocument();
    });

    it("renders provider names as subtitles", () => {
      render(<LeaderboardSection data={mockData} isLoading={false} />);

      expect(screen.getByText("openai")).toBeInTheDocument();
      expect(screen.getByText("anthropic")).toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    const emptyData: StatsLeaderboardResponse = {
      api_keys: [],
      upstreams: [],
      models: [],
    };

    it("renders empty messages when no data", () => {
      render(<LeaderboardSection data={emptyData} isLoading={false} />);

      expect(screen.getByText("stats.noApiKeys")).toBeInTheDocument();
      expect(screen.getByText("stats.noUpstreams")).toBeInTheDocument();
      expect(screen.getByText("stats.noModels")).toBeInTheDocument();
    });
  });

  describe("Icons", () => {
    it("renders trophy icon in header", () => {
      render(<LeaderboardSection data={mockData} isLoading={false} />);

      const trophyIcons = screen.getAllByTestId("trophy-icon");
      expect(trophyIcons.length).toBeGreaterThan(0);
    });

    it("renders key icon for API keys table", () => {
      render(<LeaderboardSection data={mockData} isLoading={false} />);

      expect(screen.getByTestId("key-icon")).toBeInTheDocument();
    });

    it("renders server icon for upstreams table", () => {
      render(<LeaderboardSection data={mockData} isLoading={false} />);

      expect(screen.getByTestId("server-icon")).toBeInTheDocument();
    });

    it("renders cpu icon for models table", () => {
      render(<LeaderboardSection data={mockData} isLoading={false} />);

      expect(screen.getByTestId("cpu-icon")).toBeInTheDocument();
    });
  });

  describe("Undefined Data", () => {
    it("handles undefined data gracefully", () => {
      render(<LeaderboardSection data={undefined} isLoading={false} />);

      // Should show empty messages
      expect(screen.getByText("stats.noApiKeys")).toBeInTheDocument();
      expect(screen.getByText("stats.noUpstreams")).toBeInTheDocument();
      expect(screen.getByText("stats.noModels")).toBeInTheDocument();
    });
  });
});
