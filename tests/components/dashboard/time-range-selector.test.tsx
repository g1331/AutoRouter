import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TimeRangeSelector, computeQuickRange } from "@/components/dashboard/time-range-selector";
import type { CustomDateRange } from "@/hooks/use-dashboard-stats";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("@/lib/date-locale", () => ({
  getDateLocale: () => undefined,
}));

describe("TimeRangeSelector", () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders all time range options", () => {
      render(<TimeRangeSelector value="7d" onChange={mockOnChange} />);

      expect(screen.getByText("timeRange.today")).toBeInTheDocument();
      expect(screen.getByText("timeRange.7d")).toBeInTheDocument();
      expect(screen.getByText("timeRange.30d")).toBeInTheDocument();
    });

    it("renders four buttons (three presets plus custom)", () => {
      render(<TimeRangeSelector value="7d" onChange={mockOnChange} />);

      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(4);
    });
  });

  describe("Selection State", () => {
    it("highlights today when selected", () => {
      render(<TimeRangeSelector value="today" onChange={mockOnChange} />);

      const todayButton = screen.getByText("timeRange.today");
      expect(todayButton).toHaveClass("bg-amber-500");
    });

    it("highlights 7d when selected", () => {
      render(<TimeRangeSelector value="7d" onChange={mockOnChange} />);

      const weekButton = screen.getByText("timeRange.7d");
      expect(weekButton).toHaveClass("bg-amber-500");
    });

    it("highlights 30d when selected", () => {
      render(<TimeRangeSelector value="30d" onChange={mockOnChange} />);

      const monthButton = screen.getByText("timeRange.30d");
      expect(monthButton).toHaveClass("bg-amber-500");
    });

    it("does not highlight unselected options", () => {
      render(<TimeRangeSelector value="today" onChange={mockOnChange} />);

      const weekButton = screen.getByText("timeRange.7d");
      const monthButton = screen.getByText("timeRange.30d");

      expect(weekButton).not.toHaveClass("bg-amber-500");
      expect(monthButton).not.toHaveClass("bg-amber-500");
    });
  });

  describe("Interactions", () => {
    it("calls onChange when today is clicked", () => {
      render(<TimeRangeSelector value="7d" onChange={mockOnChange} />);

      fireEvent.click(screen.getByText("timeRange.today"));

      expect(mockOnChange).toHaveBeenCalledWith("today");
    });

    it("calls onChange when 7d is clicked", () => {
      render(<TimeRangeSelector value="today" onChange={mockOnChange} />);

      fireEvent.click(screen.getByText("timeRange.7d"));

      expect(mockOnChange).toHaveBeenCalledWith("7d");
    });

    it("calls onChange when 30d is clicked", () => {
      render(<TimeRangeSelector value="today" onChange={mockOnChange} />);

      fireEvent.click(screen.getByText("timeRange.30d"));

      expect(mockOnChange).toHaveBeenCalledWith("30d");
    });

    it("calls onChange even when clicking already selected option", () => {
      render(<TimeRangeSelector value="7d" onChange={mockOnChange} />);

      fireEvent.click(screen.getByText("timeRange.7d"));

      expect(mockOnChange).toHaveBeenCalledWith("7d");
    });
  });

  describe("includeAll and reset", () => {
    it("prepends the all preset and forwards its click", () => {
      render(<TimeRangeSelector value="7d" onChange={mockOnChange} includeAll />);

      fireEvent.click(screen.getByText("timeRange.all"));
      expect(mockOnChange).toHaveBeenCalledWith("all");
    });

    it("resets a custom selection back to 7d via the X button", () => {
      const customRange: CustomDateRange = {
        start: new Date(2026, 5, 1),
        end: new Date(2026, 5, 11),
      };
      render(
        <TimeRangeSelector value="custom" customRange={customRange} onChange={mockOnChange} />
      );

      fireEvent.click(screen.getByTitle("timeRange.resetToDefault"));
      expect(mockOnChange).toHaveBeenCalledWith("7d");
    });
  });

  describe("Custom label", () => {
    it("shows MM/dd for a current-year range with the exclusive end collapsed", () => {
      const year = new Date().getFullYear();
      const customRange: CustomDateRange = {
        start: new Date(year, 5, 1),
        end: new Date(year, 5, 11), // exclusive → last shown day is 06/10
      };
      render(
        <TimeRangeSelector value="custom" customRange={customRange} onChange={mockOnChange} />
      );

      expect(screen.getByText("06/01 – 06/10")).toBeInTheDocument();
    });

    it("includes the year when the range is not in the current year", () => {
      const lastYear = new Date().getFullYear() - 1;
      const customRange: CustomDateRange = {
        start: new Date(lastYear, 0, 1),
        end: new Date(lastYear + 1, 0, 1),
      };
      render(
        <TimeRangeSelector value="custom" customRange={customRange} onChange={mockOnChange} />
      );

      expect(screen.getByText(`${lastYear}/01/01 – ${lastYear}/12/31`)).toBeInTheDocument();
    });
  });

  describe("Custom popover", () => {
    it("applies a quick preset and closes via onChange('custom', range)", () => {
      render(<TimeRangeSelector value="7d" onChange={mockOnChange} />);

      fireEvent.click(screen.getByText("timeRange.custom"));
      fireEvent.click(screen.getByText("timeRange.lastYear"));

      expect(mockOnChange).toHaveBeenCalledWith("custom", computeQuickRange("lastYear"));
    });

    it("re-seeds the pending range from the applied range and applies with an exclusive end", () => {
      const year = new Date().getFullYear();
      const customRange: CustomDateRange = {
        start: new Date(year, 5, 1),
        end: new Date(year, 5, 11),
      };
      render(
        <TimeRangeSelector value="custom" customRange={customRange} onChange={mockOnChange} />
      );

      fireEvent.click(screen.getByText("06/01 – 06/10"));

      // Re-seeded pending range is echoed under the calendar (PPP format, en).
      expect(screen.getByText(/June 1st, \d{4} – June 10th, \d{4}/)).toBeInTheDocument();

      fireEvent.click(screen.getByText("timeRange.apply"));
      expect(mockOnChange).toHaveBeenCalledWith("custom", {
        start: new Date(year, 5, 1),
        end: new Date(year, 5, 11),
      });
    });

    it("disables apply until a full range is pending", () => {
      render(<TimeRangeSelector value="7d" onChange={mockOnChange} />);

      fireEvent.click(screen.getByText("timeRange.custom"));

      expect(screen.getByText("timeRange.apply").closest("button")).toBeDisabled();
    });
  });

  describe("computeQuickRange", () => {
    // Fixed reference: Wednesday 2026-07-15 13:45 local time
    const now = new Date(2026, 6, 15, 13, 45);

    it("last90d spans 90 days ending tomorrow midnight (exclusive)", () => {
      const { start, end } = computeQuickRange("last90d", now);
      expect(start).toEqual(new Date(2026, 3, 17)); // 89 days before today
      expect(end).toEqual(new Date(2026, 6, 16));
      expect((end.getTime() - start.getTime()) / 86_400_000).toBe(90);
    });

    it("thisMonth starts at month begin and includes today", () => {
      const { start, end } = computeQuickRange("thisMonth", now);
      expect(start).toEqual(new Date(2026, 6, 1));
      expect(end).toEqual(new Date(2026, 6, 16));
    });

    it("lastMonth covers the full previous month", () => {
      const { start, end } = computeQuickRange("lastMonth", now);
      expect(start).toEqual(new Date(2026, 5, 1));
      expect(end).toEqual(new Date(2026, 6, 1));
    });

    it("thisYear starts January 1st and includes today", () => {
      const { start, end } = computeQuickRange("thisYear", now);
      expect(start).toEqual(new Date(2026, 0, 1));
      expect(end).toEqual(new Date(2026, 6, 16));
    });

    it("lastYear covers the full previous year", () => {
      const { start, end } = computeQuickRange("lastYear", now);
      expect(start).toEqual(new Date(2025, 0, 1));
      expect(end).toEqual(new Date(2026, 0, 1));
    });
  });
});
