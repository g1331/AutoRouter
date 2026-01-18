import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TokenDisplay } from "@/components/admin/token-display";
import { TooltipProvider } from "@/components/ui/tooltip";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

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

      // Check for formatted number (may be "30,000" or "30000" depending on locale)
      expect(screen.getByText(/30[,.]?000/)).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("prevents negative new tokens when cachedTokens exceeds promptTokens", () => {
      // This tests the Math.max fix for newInputTokens
      renderWithTooltip(
        <TokenDisplay
          promptTokens={50}
          completionTokens={200}
          totalTokens={250}
          cachedTokens={100} // Greater than promptTokens
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={0}
        />
      );

      // Should render without errors
      expect(screen.getByText("250")).toBeInTheDocument();
    });

    it("does not show duplicate cache read when equal to cachedTokens", () => {
      renderWithTooltip(
        <TokenDisplay
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={50}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={50} // Same as cachedTokens
        />
      );

      // Should only show cachedTokens once in the badge
      const fiftyElements = screen.getAllByText("50");
      expect(fiftyElements.length).toBe(1);
    });

    it("shows cache read when different from cachedTokens", () => {
      renderWithTooltip(
        <TokenDisplay
          promptTokens={100}
          completionTokens={200}
          totalTokens={300}
          cachedTokens={50}
          reasoningTokens={0}
          cacheCreationTokens={0}
          cacheReadTokens={30} // Different from cachedTokens
        />
      );

      // Both values should be present
      expect(screen.getByText("50")).toBeInTheDocument();
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
      trigger?.focus();

      // Use getAllByText since Radix may render tooltip content multiple times (visible + aria)
      const detailsElements = await screen.findAllByText("tokenDetails");
      expect(detailsElements.length).toBeGreaterThan(0);
      expect(screen.getAllByText("tokenInput").length).toBeGreaterThan(0);
      expect(screen.getAllByText("tokenCached").length).toBeGreaterThan(0);
      expect(screen.getAllByText("tokenOutput").length).toBeGreaterThan(0);
      expect(screen.getAllByText("tokenTotal").length).toBeGreaterThan(0);
    });
  });
});
