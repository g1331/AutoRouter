import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Calendar } from "@/components/ui/calendar";

// Mock react-day-picker
vi.mock("react-day-picker", () => ({
  DayPicker: ({
    className,
    showOutsideDays,
    classNames,
    components,
    ...props
  }: {
    className?: string;
    showOutsideDays?: boolean;
    classNames?: Record<string, string>;
    components?: { Chevron?: React.ComponentType<{ orientation: string }> };
    [key: string]: unknown;
  }) => {
    const ChevronComponent = components?.Chevron;
    return (
      <div
        data-testid="day-picker"
        data-show-outside-days={showOutsideDays}
        className={className}
        data-classnames={JSON.stringify(classNames || {})}
        {...props}
      >
        <div data-testid="calendar-content">Calendar Content</div>
        {ChevronComponent && (
          <>
            <ChevronComponent orientation="left" />
            <ChevronComponent orientation="right" />
          </>
        )}
      </div>
    );
  },
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  ChevronLeft: ({ className }: { className?: string }) => (
    <svg data-testid="chevron-left" className={className} />
  ),
  ChevronRight: ({ className }: { className?: string }) => (
    <svg data-testid="chevron-right" className={className} />
  ),
}));

describe("Calendar", () => {
  describe("Rendering", () => {
    it("renders the calendar component", () => {
      render(<Calendar />);

      expect(screen.getByTestId("day-picker")).toBeInTheDocument();
    });

    it("shows outside days by default", () => {
      render(<Calendar />);

      const picker = screen.getByTestId("day-picker");
      expect(picker).toHaveAttribute("data-show-outside-days", "true");
    });

    it("can hide outside days", () => {
      render(<Calendar showOutsideDays={false} />);

      const picker = screen.getByTestId("day-picker");
      expect(picker).toHaveAttribute("data-show-outside-days", "false");
    });
  });

  describe("Styling", () => {
    it("applies base padding class", () => {
      render(<Calendar />);

      const picker = screen.getByTestId("day-picker");
      expect(picker.className).toContain("p-3");
    });

    it("applies custom className", () => {
      render(<Calendar className="custom-class" />);

      const picker = screen.getByTestId("day-picker");
      expect(picker.className).toContain("custom-class");
    });

    it("passes classNames to DayPicker", () => {
      render(<Calendar />);

      const picker = screen.getByTestId("day-picker");
      const classNames = JSON.parse(picker.getAttribute("data-classnames") || "{}");

      expect(classNames).toHaveProperty("months");
      expect(classNames).toHaveProperty("month");
      expect(classNames).toHaveProperty("day");
    });

    it("merges custom classNames", () => {
      render(<Calendar classNames={{ months: "custom-months" }} />);

      const picker = screen.getByTestId("day-picker");
      const classNames = JSON.parse(picker.getAttribute("data-classnames") || "{}");

      expect(classNames.months).toBe("custom-months");
    });
  });

  describe("Chevron Components", () => {
    it("renders left chevron", () => {
      render(<Calendar />);

      expect(screen.getByTestId("chevron-left")).toBeInTheDocument();
    });

    it("renders right chevron", () => {
      render(<Calendar />);

      expect(screen.getByTestId("chevron-right")).toBeInTheDocument();
    });
  });

  describe("Props Passing", () => {
    it("passes additional props to DayPicker", () => {
      render(<Calendar mode="single" />);

      const picker = screen.getByTestId("day-picker");
      expect(picker).toHaveAttribute("mode", "single");
    });
  });

  describe("Display Name", () => {
    it("has correct display name", () => {
      expect(Calendar.displayName).toBe("Calendar");
    });
  });
});
