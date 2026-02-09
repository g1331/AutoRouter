import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TokenDisplay, TokenDetailContent } from "@/components/admin/token-display";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

/**
 * Create a locale-agnostic regex for formatted numbers.
 * Handles various separators: comma, dot, space, narrow no-break space, etc.
 */
function formatNumberRegex(num: number): RegExp {
  const str = num.toString();
  // Build pattern that allows any separator (or none) between digit groups
  // e.g., 30000 -> /3[,.\s\u00a0\u202f]?0[,.\s\u00a0\u202f]?0{3}/
  const pattern = str.replace(/(\d)(?=(\d{3})+$)/g, "$1[,.\\s\\u00a0\\u202f]?");
  return new RegExp(pattern);
}

/**
 * TokenDisplay Component Tests
 *
 * Tests compact token display for table cells.
 */
describe("TokenDisplay", () => {
  describe("Basic Rendering", () => {
    it("renders dash for zero total tokens", () => {
      render(
        <TokenDisplay
          promptTokens={0}
          completionTokens={0}
          totalTokens={0}
          cachedTokens={0}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      expect(screen.getByText("-")).toBeInTheDocument();
    });

    it("renders total tokens", () => {
      render(
        <TokenDisplay
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={0}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      expect(screen.getByText("300")).toBeInTheDocument();
    });

    it("renders input/output breakdown", () => {
      render(
        <TokenDisplay
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={0}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      expect(screen.getByText("100 / 200")).toBeInTheDocument();
    });
  });

  describe("Cache Indicator", () => {
    it("shows cache badge when cachedTokens > 0", () => {
      render(
        <TokenDisplay
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={50}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      const cacheHitBadge = screen.getByText("tokenCacheHitShort").closest("div");
      expect(cacheHitBadge).not.toBeNull();
      expect(within(cacheHitBadge as HTMLElement).getByText("50")).toBeInTheDocument();
    });

    it("does not show cache badge when cachedTokens is 0", () => {
      render(
        <TokenDisplay
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={0}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      // Only total and breakdown should be present
      const textElements = screen.getAllByText(/\d+/);
      expect(textElements.length).toBe(2); // 300 and "100 / 200"
    });
  });

  describe("Number Formatting", () => {
    it("formats large numbers with locale separator", () => {
      render(
        <TokenDisplay
          promptTokens={10000}
          completionTokens={20000}
          totalTokens={30000}
          cachedTokens={0}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      // Check for formatted number (handles various locale separators)
      expect(screen.getByText(formatNumberRegex(30000))).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("shows cache read using cachedTokens when cacheReadTokens is 0 (OpenAI)", () => {
      // This tests OpenAI scenario where only cachedTokens is populated
      render(
        <TokenDisplay
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={50}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      // Should render cache badge with cachedTokens value
      const cacheHitBadge = screen.getByText("tokenCacheHitShort").closest("div");
      expect(cacheHitBadge).not.toBeNull();
      expect(within(cacheHitBadge as HTMLElement).getByText("50")).toBeInTheDocument();
    });

    it("shows cache read using cacheReadTokens when both are present (Anthropic)", () => {
      render(
        <TokenDisplay
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={50}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={30} // Anthropic-specific field takes priority
        />
      );

      // Cache badge should use cacheReadTokens (30) not cachedTokens (50)
      const cacheHitBadge = screen.getByText("tokenCacheHitShort").closest("div");
      expect(cacheHitBadge).not.toBeNull();
      expect(within(cacheHitBadge as HTMLElement).getByText("30")).toBeInTheDocument();
    });

    it("shows new input (prompt - cache hit) in breakdown", () => {
      render(
        <TokenDisplay
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={50}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      expect(screen.getByText("50 / 200")).toBeInTheDocument();
    });

    it("shows cache write badge when cacheCreationTokens > 0", () => {
      render(
        <TokenDisplay
          promptTokens={1000}
          completionTokens={200}
          totalTokens={1200}
          cachedTokens={0}
          reasoningTokens={0}
          cacheCreationTokens={100}
          cacheReadTokens={800}
        />
      );

      const cacheWriteBadge = screen.getByText("tokenCacheWriteShort").closest("div");
      expect(cacheWriteBadge).not.toBeNull();
      expect(within(cacheWriteBadge as HTMLElement).getByText("100")).toBeInTheDocument();
    });
  });
});

/**
 * TokenDetailContent Component Tests
 *
 * Tests detailed token breakdown for expanded row area.
 */
describe("TokenDetailContent", () => {
  describe("Basic Rendering", () => {
    it("renders header and main token rows", () => {
      render(
        <TokenDetailContent
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={0}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      expect(screen.getByText("tokenDetails")).toBeInTheDocument();
      expect(screen.getByText("tokenInput")).toBeInTheDocument();
      expect(screen.getByText("tokenOutput")).toBeInTheDocument();
      expect(screen.getByText("tokenTotal")).toBeInTheDocument();
    });

    it("renders formatted token values", () => {
      render(
        <TokenDetailContent
          promptTokens={1000}
          completionTokens={2000}
          totalTokens={3000}
          cachedTokens={0}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      expect(screen.getByText(formatNumberRegex(1000))).toBeInTheDocument();
      expect(screen.getByText(formatNumberRegex(2000))).toBeInTheDocument();
      expect(screen.getByText(formatNumberRegex(3000))).toBeInTheDocument();
    });
  });

  describe("Reasoning Breakdown", () => {
    it("shows reasoning and reply breakdown when reasoningTokens > 0", () => {
      render(
        <TokenDetailContent
          promptTokens={100}
          completionTokens={500}
          totalTokens={600}
          cachedTokens={0}
          reasoningTokens={300}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      expect(screen.getByText("tokenReasoning")).toBeInTheDocument();
      expect(screen.getByText("tokenReply")).toBeInTheDocument();
      // reasoning = 300, reply = 500 - 300 = 200
      expect(screen.getByText("300")).toBeInTheDocument();
      expect(screen.getByText("200")).toBeInTheDocument();
    });

    it("does not show reasoning breakdown when reasoningTokens is 0", () => {
      render(
        <TokenDetailContent
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={0}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      expect(screen.queryByText("tokenReasoning")).not.toBeInTheDocument();
      expect(screen.queryByText("tokenReply")).not.toBeInTheDocument();
    });
  });

  describe("Cache Section", () => {
    it("shows cache write when cacheCreationTokens > 0 (Anthropic)", () => {
      render(
        <TokenDetailContent
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={0}
          reasoningTokens={0}
          cacheCreationTokens={25}
          cacheReadTokens={0}
        />
      );

      expect(screen.getByText("tokenCacheWrite")).toBeInTheDocument();
      expect(screen.getByText("25")).toBeInTheDocument();
    });

    it("shows cache hit + new input breakdown when cacheReadTokens > 0 (Anthropic)", () => {
      render(
        <TokenDetailContent
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={0}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={50}
        />
      );

      expect(screen.getByText("tokenCacheHit")).toBeInTheDocument();
      expect(screen.getByText("tokenInputNew")).toBeInTheDocument();

      const cacheHitRow = screen.getByText("tokenCacheHit").closest("div");
      expect(cacheHitRow).not.toBeNull();
      expect(within(cacheHitRow as HTMLElement).getByText("50")).toBeInTheDocument();

      const newInputRow = screen.getByText("tokenInputNew").closest("div");
      expect(newInputRow).not.toBeNull();
      expect(within(newInputRow as HTMLElement).getByText("50")).toBeInTheDocument();
    });

    it("shows cache hit using cachedTokens when cacheReadTokens is 0 (OpenAI)", () => {
      render(
        <TokenDetailContent
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={80}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      expect(screen.getByText("tokenCacheHit")).toBeInTheDocument();
      expect(screen.getByText("tokenInputNew")).toBeInTheDocument();
      expect(screen.getByText("80")).toBeInTheDocument();
    });

    it("prefers cacheReadTokens over cachedTokens when both present", () => {
      render(
        <TokenDetailContent
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={80}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={50}
        />
      );

      // Should show 50 (cacheReadTokens), not 80 (cachedTokens)
      const cacheHitRow = screen.getByText("tokenCacheHit").closest("div");
      expect(cacheHitRow).not.toBeNull();
      expect(within(cacheHitRow as HTMLElement).getByText("50")).toBeInTheDocument();
      expect(screen.queryByText("80")).not.toBeInTheDocument();
    });

    it("shows cache write + hit + new input (Anthropic full scenario)", () => {
      render(
        <TokenDetailContent
          promptTokens={1000}
          completionTokens={200}
          totalTokens={1200}
          cachedTokens={0}
          reasoningTokens={0}
          cacheCreationTokens={100}
          cacheReadTokens={800}
        />
      );

      expect(screen.getByText("tokenCacheWrite")).toBeInTheDocument();
      expect(screen.getByText("tokenCacheHit")).toBeInTheDocument();
      expect(screen.getByText("tokenInputNew")).toBeInTheDocument();
      expect(screen.getByText("100")).toBeInTheDocument();
      expect(screen.getByText("800")).toBeInTheDocument();

      // new input = 1000 - 800 = 200 (assert within the "tokenInputNew" row)
      const newInputRow = screen.getByText("tokenInputNew").closest("div");
      expect(newInputRow).not.toBeNull();
      expect(within(newInputRow as HTMLElement).getByText("200")).toBeInTheDocument();
    });

    it("does not show cache section when no cache tokens present", () => {
      render(
        <TokenDetailContent
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={0}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      expect(screen.queryByText("tokenCacheWrite")).not.toBeInTheDocument();
      expect(screen.queryByText("tokenCacheHit")).not.toBeInTheDocument();
      expect(screen.queryByText("tokenInputNew")).not.toBeInTheDocument();
    });
  });

  describe("Complex Scenarios", () => {
    it("shows complete breakdown for reasoning + cache scenario", () => {
      render(
        <TokenDetailContent
          promptTokens={1000}
          completionTokens={500}
          totalTokens={1500}
          cachedTokens={800}
          reasoningTokens={300}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      // Main tokens
      expect(screen.getByText("tokenInput")).toBeInTheDocument();
      expect(screen.getByText("tokenOutput")).toBeInTheDocument();

      // Reasoning breakdown
      expect(screen.getByText("tokenReasoning")).toBeInTheDocument();
      expect(screen.getByText("tokenReply")).toBeInTheDocument();

      // Cache (OpenAI style - cachedTokens maps to cache hit)
      expect(screen.getByText("tokenCacheHit")).toBeInTheDocument();
      expect(screen.getByText("tokenInputNew")).toBeInTheDocument();

      // Total
      expect(screen.getByText("tokenTotal")).toBeInTheDocument();
    });
  });
});
