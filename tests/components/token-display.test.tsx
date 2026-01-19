import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { TokenDisplay } from "@/components/admin/token-display";
import { TooltipProvider } from "@/components/ui/tooltip";

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
 * Helper to render with TooltipProvider
 */
function renderWithTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

/**
 * TokenDisplay Component Tests
 *
 * Tests token display, tooltip content, and edge cases.
 */
describe("TokenDisplay", () => {
  describe("Basic Rendering", () => {
    it("renders dash for zero total tokens", () => {
      renderWithTooltip(
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
      renderWithTooltip(
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
      renderWithTooltip(
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
      renderWithTooltip(
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

      expect(screen.getByText("50")).toBeInTheDocument();
    });

    it("does not show cache badge when cachedTokens is 0", () => {
      renderWithTooltip(
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
      renderWithTooltip(
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
      renderWithTooltip(
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
      expect(screen.getByText("50")).toBeInTheDocument();
    });

    it("shows cache read using cacheReadTokens when both are present (Anthropic)", () => {
      renderWithTooltip(
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
      expect(screen.getByText("30")).toBeInTheDocument();
    });

    it("shows cache write when cacheCreationTokens is present (Anthropic)", () => {
      renderWithTooltip(
        <TokenDisplay
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={0}
          reasoningTokens={0}
          cacheCreationTokens={25}
          cacheReadTokens={0}
        />
      );

      // Should render without errors
      expect(screen.getByText("300")).toBeInTheDocument();
    });

    it("splits output into reasoning and reply when reasoningTokens > 0 (OpenAI o1/o3)", () => {
      renderWithTooltip(
        <TokenDisplay
          promptTokens={100}
          completionTokens={500}
          totalTokens={600}
          cachedTokens={0}
          reasoningTokens={300}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      // Should render total and breakdown
      expect(screen.getByText("600")).toBeInTheDocument();
      expect(screen.getByText("100 / 500")).toBeInTheDocument();
    });

    it("calculates reply tokens correctly (output - reasoning)", () => {
      renderWithTooltip(
        <TokenDisplay
          promptTokens={100}
          completionTokens={500}
          totalTokens={600}
          cachedTokens={0}
          reasoningTokens={300} // reply = 500 - 300 = 200
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      // Should render without errors
      expect(screen.getByText("600")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has keyboard-accessible trigger with tabIndex", () => {
      renderWithTooltip(
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

      // Find the trigger div
      const trigger = screen.getByText("300").closest("div");
      expect(trigger).toHaveAttribute("tabindex", "0");
    });

    it("renders tooltip details on focus", async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider delayDuration={0}>
          <TokenDisplay
            promptTokens={100}
            completionTokens={200}
            totalTokens={300}
            cachedTokens={50}
            reasoningTokens={0}
            cacheCreationTokens={0}
            cacheReadTokens={0}
          />
        </TooltipProvider>
      );

      const trigger = screen.getByText("300").closest("div");
      await user.hover(trigger!);

      // Use getAllByText since Radix may render tooltip content multiple times (visible + aria)
      const detailsElements = await screen.findAllByText("tokenDetails");
      expect(detailsElements.length).toBeGreaterThan(0);
      expect(screen.getAllByText("tokenInput").length).toBeGreaterThan(0);
      expect(screen.getAllByText("tokenCacheRead").length).toBeGreaterThan(0);
      expect(screen.getAllByText("tokenOutput").length).toBeGreaterThan(0);
      expect(screen.getAllByText("tokenTotal").length).toBeGreaterThan(0);
    });
  });

  describe("Tooltip Content Details", () => {
    it("shows tokenCacheWrite with correct value in tooltip (Anthropic)", async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider delayDuration={0}>
          <TokenDisplay
            promptTokens={100}
            completionTokens={200}
            totalTokens={300}
            cachedTokens={0}
            reasoningTokens={0}
            cacheCreationTokens={25}
            cacheReadTokens={0}
          />
        </TooltipProvider>
      );

      const trigger = screen.getByText("300").closest("div");
      await user.hover(trigger!);

      // Verify tokenCacheWrite label appears in tooltip
      const cacheWriteLabels = await screen.findAllByText("tokenCacheWrite");
      expect(cacheWriteLabels.length).toBeGreaterThan(0);

      // Verify the value 25 appears in tooltip
      const valueElements = screen.getAllByText("25");
      expect(valueElements.length).toBeGreaterThan(0);
    });

    it("shows tokenReasoning and tokenReply with correct values in tooltip (OpenAI o1/o3)", async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider delayDuration={0}>
          <TokenDisplay
            promptTokens={100}
            completionTokens={500}
            totalTokens={600}
            cachedTokens={0}
            reasoningTokens={300}
            cacheCreationTokens={0}
            cacheReadTokens={0}
          />
        </TooltipProvider>
      );

      const trigger = screen.getByText("600").closest("div");
      await user.hover(trigger!);

      // Verify tokenReasoning label appears
      const reasoningLabels = await screen.findAllByText("tokenReasoning");
      expect(reasoningLabels.length).toBeGreaterThan(0);

      // Verify tokenReply label appears
      const replyLabels = screen.getAllByText("tokenReply");
      expect(replyLabels.length).toBeGreaterThan(0);

      // Verify reasoning value (300)
      const reasoningValues = screen.getAllByText("300");
      expect(reasoningValues.length).toBeGreaterThan(0);

      // Verify reply value (500 - 300 = 200)
      const replyValues = screen.getAllByText("200");
      expect(replyValues.length).toBeGreaterThan(0);
    });

    it("does not show tokenReasoning/tokenReply when reasoningTokens is 0", async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider delayDuration={0}>
          <TokenDisplay
            promptTokens={100}
            completionTokens={200}
            totalTokens={300}
            cachedTokens={0}
            reasoningTokens={0}
            cacheCreationTokens={0}
            cacheReadTokens={0}
          />
        </TooltipProvider>
      );

      const trigger = screen.getByText("300").closest("div");
      await user.hover(trigger!);

      // Wait for tooltip to appear
      await screen.findAllByText("tokenDetails");

      // Verify tokenReasoning does NOT appear
      expect(screen.queryAllByText("tokenReasoning").length).toBe(0);
      expect(screen.queryAllByText("tokenReply").length).toBe(0);
    });

    it("does not show cache section when no cache tokens present", async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider delayDuration={0}>
          <TokenDisplay
            promptTokens={100}
            completionTokens={200}
            totalTokens={300}
            cachedTokens={0}
            reasoningTokens={0}
            cacheCreationTokens={0}
            cacheReadTokens={0}
          />
        </TooltipProvider>
      );

      const trigger = screen.getByText("300").closest("div");
      await user.hover(trigger!);

      // Wait for tooltip to appear
      await screen.findAllByText("tokenDetails");

      // Verify cache labels do NOT appear
      expect(screen.queryAllByText("tokenCacheWrite").length).toBe(0);
      expect(screen.queryAllByText("tokenCacheRead").length).toBe(0);
    });

    it("shows both cache write and cache read in tooltip (Anthropic full scenario)", async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider delayDuration={0}>
          <TokenDisplay
            promptTokens={1000}
            completionTokens={200}
            totalTokens={1200}
            cachedTokens={0}
            reasoningTokens={0}
            cacheCreationTokens={100}
            cacheReadTokens={800}
          />
        </TooltipProvider>
      );

      const trigger = screen.getByText(formatNumberRegex(1200)).closest("div");
      await user.hover(trigger!);

      // Wait for tooltip
      await screen.findAllByText("tokenDetails");

      // Verify both cache labels appear
      expect(screen.getAllByText("tokenCacheWrite").length).toBeGreaterThan(0);
      expect(screen.getAllByText("tokenCacheRead").length).toBeGreaterThan(0);

      // Verify values
      expect(screen.getAllByText("100").length).toBeGreaterThan(0);
      expect(screen.getAllByText("800").length).toBeGreaterThan(0);
    });

    it("shows complete breakdown for complex scenario (reasoning + cache)", async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider delayDuration={0}>
          <TokenDisplay
            promptTokens={1000}
            completionTokens={500}
            totalTokens={1500}
            cachedTokens={800}
            reasoningTokens={300}
            cacheCreationTokens={0}
            cacheReadTokens={0}
          />
        </TooltipProvider>
      );

      const trigger = screen.getByText(formatNumberRegex(1500)).closest("div");
      await user.hover(trigger!);

      // Wait for tooltip
      await screen.findAllByText("tokenDetails");

      // Verify main tokens
      expect(screen.getAllByText("tokenInput").length).toBeGreaterThan(0);
      expect(screen.getAllByText("tokenOutput").length).toBeGreaterThan(0);

      // Verify reasoning breakdown
      expect(screen.getAllByText("tokenReasoning").length).toBeGreaterThan(0);
      expect(screen.getAllByText("tokenReply").length).toBeGreaterThan(0);

      // Verify cache (OpenAI style - cachedTokens maps to cacheRead)
      expect(screen.getAllByText("tokenCacheRead").length).toBeGreaterThan(0);

      // Verify total
      expect(screen.getAllByText("tokenTotal").length).toBeGreaterThan(0);
    });
  });
});
