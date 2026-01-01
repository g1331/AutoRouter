import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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

    it("renders three buttons", () => {
      render(<TimeRangeSelector value="7d" onChange={mockOnChange} />);

      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(3);
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
});
