import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RefreshIntervalSelect } from "@/components/admin/refresh-interval-select";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

/**
 * RefreshIntervalSelect Component Tests
 *
 * Tests refresh interval selection, localStorage persistence, and callbacks.
 */
describe("RefreshIntervalSelect", () => {
  const mockOnIntervalChange = vi.fn();
  const mockOnManualRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("Initial Rendering", () => {
    it("renders with default interval when localStorage is empty", () => {
      render(
        <RefreshIntervalSelect
          onIntervalChange={mockOnIntervalChange}
          onManualRefresh={mockOnManualRefresh}
        />
      );

      // Should call onIntervalChange with false (0 seconds = off)
      expect(mockOnIntervalChange).toHaveBeenCalledWith(false);
    });

    it("reads interval from localStorage on mount", () => {
      localStorage.setItem("logs-refresh-interval", "30");

      render(
        <RefreshIntervalSelect
          onIntervalChange={mockOnIntervalChange}
          onManualRefresh={mockOnManualRefresh}
        />
      );

      // Should call onIntervalChange with 30000ms (30 seconds)
      expect(mockOnIntervalChange).toHaveBeenCalledWith(30000);
    });

    it("falls back to default for invalid localStorage value", () => {
      localStorage.setItem("logs-refresh-interval", "invalid");

      render(
        <RefreshIntervalSelect
          onIntervalChange={mockOnIntervalChange}
          onManualRefresh={mockOnManualRefresh}
        />
      );

      // Should call onIntervalChange with false (default = off)
      expect(mockOnIntervalChange).toHaveBeenCalledWith(false);
    });
  });

  describe("Manual Refresh Button", () => {
    it("renders manual refresh button", () => {
      render(
        <RefreshIntervalSelect
          onIntervalChange={mockOnIntervalChange}
          onManualRefresh={mockOnManualRefresh}
        />
      );

      expect(screen.getByText("manualRefresh")).toBeInTheDocument();
    });

    it("calls onManualRefresh when button clicked", () => {
      render(
        <RefreshIntervalSelect
          onIntervalChange={mockOnIntervalChange}
          onManualRefresh={mockOnManualRefresh}
        />
      );

      const button = screen.getByText("manualRefresh");
      fireEvent.click(button);

      expect(mockOnManualRefresh).toHaveBeenCalledTimes(1);
    });

    it("disables button when isRefreshing is true", () => {
      render(
        <RefreshIntervalSelect
          onIntervalChange={mockOnIntervalChange}
          onManualRefresh={mockOnManualRefresh}
          isRefreshing={true}
        />
      );

      const button = screen.getByText("manualRefresh").closest("button");
      expect(button).toBeDisabled();
    });

    it("shows spinning animation when isRefreshing is true", () => {
      render(
        <RefreshIntervalSelect
          onIntervalChange={mockOnIntervalChange}
          onManualRefresh={mockOnManualRefresh}
          isRefreshing={true}
        />
      );

      // Find the RefreshCw icon (it has animate-spin class when refreshing)
      const button = screen.getByText("manualRefresh").closest("button");
      const icon = button?.querySelector("svg");
      expect(icon).toHaveClass("animate-spin");
    });
  });

  describe("Select Dropdown", () => {
    it("renders select with interval options", () => {
      render(
        <RefreshIntervalSelect
          onIntervalChange={mockOnIntervalChange}
          onManualRefresh={mockOnManualRefresh}
        />
      );

      // Select trigger should be present
      const trigger = screen.getByRole("combobox");
      expect(trigger).toBeInTheDocument();
    });
  });

  describe("Interval Values", () => {
    it.each([
      ["0", false],
      ["10", 10000],
      ["30", 30000],
      ["60", 60000],
    ])("converts interval '%s' to %s ms", (interval, expectedMs) => {
      localStorage.setItem("logs-refresh-interval", interval);

      render(
        <RefreshIntervalSelect
          onIntervalChange={mockOnIntervalChange}
          onManualRefresh={mockOnManualRefresh}
        />
      );

      expect(mockOnIntervalChange).toHaveBeenCalledWith(expectedMs);
    });
  });
});
