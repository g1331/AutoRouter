import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AsciiProgress } from "@/components/ui/terminal/ascii-progress";

describe("AsciiProgress", () => {
  describe("progress bar display", () => {
    it("displays correct filled/empty ratio for 50%", () => {
      render(<AsciiProgress value={50} max={100} width={10} />);

      const progressbar = screen.getByRole("progressbar");
      // 50% of 10 = 5 filled, 5 empty
      expect(progressbar).toHaveTextContent("█████░░░░░");
    });

    it("displays all empty blocks for 0%", () => {
      render(<AsciiProgress value={0} max={100} width={10} />);

      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toHaveTextContent("░░░░░░░░░░");
    });

    it("displays all filled blocks for 100%", () => {
      render(<AsciiProgress value={100} max={100} width={10} />);

      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toHaveTextContent("██████████");
    });

    it("handles values exceeding max (caps at 100%)", () => {
      render(<AsciiProgress value={150} max={100} width={10} />);

      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toHaveTextContent("██████████");
    });

    it("handles negative values (floors at 0%)", () => {
      render(<AsciiProgress value={-10} max={100} width={10} />);

      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toHaveTextContent("░░░░░░░░░░");
    });
  });

  describe("configurable width", () => {
    it("uses default width of 10 characters", () => {
      render(<AsciiProgress value={50} max={100} />);

      const progressbar = screen.getByRole("progressbar");
      const barText = progressbar.querySelector("span.text-xs")?.textContent || "";
      expect(barText.length).toBe(10);
    });

    it("respects custom width", () => {
      render(<AsciiProgress value={50} max={100} width={5} />);

      const progressbar = screen.getByRole("progressbar");
      // 50% of 5 = 2.5, rounds to 3 filled
      expect(progressbar).toHaveTextContent(/^[█░]{5}/);
    });
  });

  describe("value label display", () => {
    it("hides value by default", () => {
      render(<AsciiProgress value={30} max={100} />);

      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).not.toHaveTextContent("30");
    });

    it("shows value when showValue is true", () => {
      render(<AsciiProgress value={30} max={100} showValue />);

      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toHaveTextContent("30");
    });

    it("shows percentage when showPercentage is true", () => {
      render(<AsciiProgress value={75} max={100} showPercentage />);

      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toHaveTextContent("75%");
    });

    it("prefers showValue over showPercentage when both are true", () => {
      render(<AsciiProgress value={30} max={100} showValue showPercentage />);

      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toHaveTextContent("30");
      expect(progressbar).not.toHaveTextContent("30%");
    });
  });

  describe("color variants", () => {
    it("uses amber color by default", () => {
      render(<AsciiProgress value={50} max={100} />);

      const progressbar = screen.getByRole("progressbar");
      const filledSpan = progressbar.querySelector(".text-amber-500");
      expect(filledSpan).toBeInTheDocument();
    });

    it("uses green color for success variant", () => {
      render(<AsciiProgress value={50} max={100} variant="success" />);

      const progressbar = screen.getByRole("progressbar");
      const filledSpan = progressbar.querySelector(".text-status-success");
      expect(filledSpan).toBeInTheDocument();
    });

    it("uses amber color for warning variant", () => {
      render(<AsciiProgress value={50} max={100} variant="warning" />);

      const progressbar = screen.getByRole("progressbar");
      const filledSpan = progressbar.querySelector(".text-amber-500");
      expect(filledSpan).toBeInTheDocument();
    });

    it("uses red color for error variant", () => {
      render(<AsciiProgress value={50} max={100} variant="error" />);

      const progressbar = screen.getByRole("progressbar");
      const filledSpan = progressbar.querySelector(".text-status-error");
      expect(filledSpan).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has role=progressbar", () => {
      render(<AsciiProgress value={50} max={100} />);

      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    it("has correct aria-valuenow", () => {
      render(<AsciiProgress value={75} max={100} />);

      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
    });

    it("has correct aria-valuemin and aria-valuemax", () => {
      render(<AsciiProgress value={50} max={100} />);

      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toHaveAttribute("aria-valuemin", "0");
      expect(progressbar).toHaveAttribute("aria-valuemax", "100");
    });

    it("has aria-label describing progress", () => {
      render(<AsciiProgress value={75} max={100} />);

      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-label", "Progress: 75%");
    });
  });

  describe("edge cases", () => {
    it("handles max=0 gracefully", () => {
      render(<AsciiProgress value={50} max={0} width={10} />);

      const progressbar = screen.getByRole("progressbar");
      // Should show all empty when max is 0
      expect(progressbar).toHaveTextContent("░░░░░░░░░░");
    });

    it("handles non-integer values", () => {
      render(<AsciiProgress value={33.33} max={100} width={10} />);

      const progressbar = screen.getByRole("progressbar");
      // Should round appropriately
      expect(progressbar).toBeInTheDocument();
    });
  });
});
