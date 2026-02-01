import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusLed } from "@/components/ui/terminal/status-led";

describe("StatusLed", () => {
  describe("LED indicator states", () => {
    it("displays healthy state with green LED character", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      expect(led).toHaveAttribute("aria-label", "Status: healthy");
      expect(led).toHaveTextContent("◉");
    });

    it("displays degraded state with amber LED character", () => {
      render(<StatusLed status="degraded" />);

      const led = screen.getByRole("status");
      expect(led).toHaveAttribute("aria-label", "Status: degraded");
      expect(led).toHaveTextContent("◎");
    });

    it("displays offline state with red LED character", () => {
      render(<StatusLed status="offline" />);

      const led = screen.getByRole("status");
      expect(led).toHaveAttribute("aria-label", "Status: offline");
      expect(led).toHaveTextContent("●");
    });
  });

  describe("label display", () => {
    it("hides label by default", () => {
      render(<StatusLed status="healthy" />);

      // Should only have the LED character, not the label text
      const led = screen.getByRole("status");
      expect(led.textContent).toBe("◉");
    });

    it("shows label when showLabel is true", () => {
      render(<StatusLed status="healthy" showLabel />);

      const led = screen.getByRole("status");
      expect(led).toHaveTextContent("◉");
      expect(led).toHaveTextContent("healthy");
    });

    it("uses custom label when provided", () => {
      render(<StatusLed status="healthy" label="Online" showLabel />);

      const led = screen.getByRole("status");
      expect(led).toHaveAttribute("aria-label", "Status: Online");
      expect(led).toHaveTextContent("Online");
    });
  });

  describe("accessibility", () => {
    it("has role=status for screen readers", () => {
      render(<StatusLed status="healthy" />);

      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("has aria-label describing the status", () => {
      render(<StatusLed status="degraded" />);

      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Status: degraded");
    });

    it("marks LED character as aria-hidden", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      const ledChar = led.querySelector("[aria-hidden='true']");
      expect(ledChar).toBeInTheDocument();
      expect(ledChar).toHaveTextContent("◉");
    });
  });

  describe("styling", () => {
    it("applies custom className", () => {
      render(<StatusLed status="healthy" className="custom-class" />);

      const led = screen.getByRole("status");
      expect(led).toHaveClass("custom-class");
    });

    it("uses monospace font", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      expect(led).toHaveClass("font-mono");
    });
  });

  describe("animation classes", () => {
    it("applies pulse animation for healthy state", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      const ledChar = led.querySelector("[aria-hidden='true']");
      expect(ledChar?.className).toContain("animate-[cf-led-pulse_2s");
    });

    it("applies faster pulse animation for degraded state", () => {
      render(<StatusLed status="degraded" />);

      const led = screen.getByRole("status");
      const ledChar = led.querySelector("[aria-hidden='true']");
      expect(ledChar?.className).toContain("animate-[cf-led-pulse_1s");
    });

    it("does not apply pulse animation for offline state", () => {
      render(<StatusLed status="offline" />);

      const led = screen.getByRole("status");
      const ledChar = led.querySelector("[aria-hidden='true']");
      expect(ledChar?.className).not.toContain("animate-[cf-led-pulse");
    });
  });
});
