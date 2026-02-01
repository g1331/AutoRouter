import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MiniSparkline } from "@/components/ui/terminal/mini-sparkline";

describe("MiniSparkline", () => {
  describe("sparkline display", () => {
    it("displays Unicode block characters for data", () => {
      render(<MiniSparkline data={[10, 20, 30, 40, 50]} />);

      const sparkline = screen.getByRole("img");
      // Should contain block characters
      expect(sparkline.textContent).toMatch(/[▁▂▃▄▅▆▇█]+/);
    });

    it("displays placeholder for empty data", () => {
      render(<MiniSparkline data={[]} />);

      const sparkline = screen.getByRole("img");
      expect(sparkline).toHaveTextContent("---");
    });

    it("displays single block for single value", () => {
      render(<MiniSparkline data={[50]} width={1} />);

      const sparkline = screen.getByRole("img");
      expect(sparkline.textContent).toMatch(/[▁▂▃▄▅▆▇█]/);
    });

    it("normalizes values to 8-level scale", () => {
      // Min=0, Max=70, so values should map across the scale
      render(<MiniSparkline data={[0, 10, 20, 30, 40, 50, 60, 70]} width={8} />);

      const sparkline = screen.getByRole("img");
      // First should be lowest, last should be highest
      const text = sparkline.textContent || "";
      expect(text).toContain("▁"); // lowest
      expect(text).toContain("█"); // highest
    });

    it("handles all same values (flat line)", () => {
      render(<MiniSparkline data={[50, 50, 50, 50, 50]} width={5} />);

      const sparkline = screen.getByRole("img");
      // All same value should show middle height blocks
      const text = sparkline.textContent || "";
      // Should be uniform
      expect(text.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("configurable width", () => {
    it("uses default width of 10", () => {
      const data = Array.from({ length: 20 }, (_, i) => i);
      render(<MiniSparkline data={data} />);

      const sparkline = screen.getByRole("img");
      const text = sparkline.querySelector("span.text-xs")?.textContent || "";
      // Should only show last 10 data points
      expect(text.length).toBe(10);
    });

    it("respects custom width", () => {
      const data = Array.from({ length: 20 }, (_, i) => i);
      render(<MiniSparkline data={data} width={5} />);

      const sparkline = screen.getByRole("img");
      const text = sparkline.querySelector("span.text-xs")?.textContent || "";
      expect(text.length).toBe(5);
    });

    it("shows all data when data length is less than width", () => {
      render(<MiniSparkline data={[10, 20, 30]} width={10} />);

      const sparkline = screen.getByRole("img");
      const text = sparkline.querySelector("span.text-xs")?.textContent || "";
      expect(text.length).toBe(3);
    });
  });

  describe("current value display", () => {
    it("hides value by default", () => {
      render(<MiniSparkline data={[10, 20, 30]} />);

      const sparkline = screen.getByRole("img");
      expect(sparkline).not.toHaveTextContent("30");
    });

    it("shows value when showValue is true", () => {
      render(<MiniSparkline data={[10, 20, 30]} showValue />);

      const sparkline = screen.getByRole("img");
      expect(sparkline).toHaveTextContent("30");
    });

    it("uses custom formatter when provided", () => {
      render(<MiniSparkline data={[100, 200, 300]} showValue formatValue={(v) => `${v}ms`} />);

      const sparkline = screen.getByRole("img");
      expect(sparkline).toHaveTextContent("300ms");
    });
  });

  describe("color by trend", () => {
    it("uses amber color by default", () => {
      render(<MiniSparkline data={[10, 20, 30, 40, 50]} />);

      const sparkline = screen.getByRole("img");
      const coloredSpan = sparkline.querySelector(".text-amber-500");
      expect(coloredSpan).toBeInTheDocument();
    });

    it("uses green for upward trend when colorByTrend is true", () => {
      // Clear upward trend
      render(<MiniSparkline data={[10, 20, 30, 40, 50, 60, 70, 80]} colorByTrend />);

      const sparkline = screen.getByRole("img");
      const coloredSpan = sparkline.querySelector(".text-status-success");
      expect(coloredSpan).toBeInTheDocument();
    });

    it("uses red for downward trend when colorByTrend is true", () => {
      // Clear downward trend
      render(<MiniSparkline data={[80, 70, 60, 50, 40, 30, 20, 10]} colorByTrend />);

      const sparkline = screen.getByRole("img");
      const coloredSpan = sparkline.querySelector(".text-status-error");
      expect(coloredSpan).toBeInTheDocument();
    });

    it("inverts trend colors when invertTrend is true", () => {
      // Downward trend with invertTrend should be green (good for latency)
      render(<MiniSparkline data={[80, 70, 60, 50, 40, 30, 20, 10]} colorByTrend invertTrend />);

      const sparkline = screen.getByRole("img");
      const coloredSpan = sparkline.querySelector(".text-status-success");
      expect(coloredSpan).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has role=img", () => {
      render(<MiniSparkline data={[10, 20, 30]} />);

      expect(screen.getByRole("img")).toBeInTheDocument();
    });

    it("has aria-label describing the trend", () => {
      render(<MiniSparkline data={[10, 20, 30]} />);

      const sparkline = screen.getByRole("img");
      expect(sparkline).toHaveAttribute("aria-label");
      expect(sparkline.getAttribute("aria-label")).toContain("Trend:");
    });

    it("includes current value in aria-label when showValue is true", () => {
      render(<MiniSparkline data={[10, 20, 30]} showValue />);

      const sparkline = screen.getByRole("img");
      expect(sparkline.getAttribute("aria-label")).toContain("current value: 30");
    });
  });

  describe("styling", () => {
    it("applies custom className", () => {
      render(<MiniSparkline data={[10, 20, 30]} className="custom-class" />);

      const sparkline = screen.getByRole("img");
      expect(sparkline).toHaveClass("custom-class");
    });

    it("uses monospace font", () => {
      render(<MiniSparkline data={[10, 20, 30]} />);

      const sparkline = screen.getByRole("img");
      expect(sparkline).toHaveClass("font-mono");
    });
  });
});
