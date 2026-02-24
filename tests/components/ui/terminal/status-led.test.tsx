import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusLed } from "@/components/ui/terminal/status-led";

describe("StatusLed", () => {
  describe("LED indicator states", () => {
    it("displays healthy state with compact label", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      expect(led).toHaveAttribute("aria-label", "Status: healthy");
      expect(led).toHaveTextContent("OK");
    });

    it("displays degraded state with compact label", () => {
      render(<StatusLed status="degraded" />);

      const led = screen.getByRole("status");
      expect(led).toHaveAttribute("aria-label", "Status: degraded");
      expect(led).toHaveTextContent("WARN");
    });

    it("displays offline state with compact label", () => {
      render(<StatusLed status="offline" />);

      const led = screen.getByRole("status");
      expect(led).toHaveAttribute("aria-label", "Status: offline");
      expect(led).toHaveTextContent("DOWN");
    });
  });

  describe("label display", () => {
    it("hides label by default", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      expect(led.textContent).toBe("OK");
    });

    it("shows label when showLabel is true", () => {
      render(<StatusLed status="healthy" showLabel />);

      const led = screen.getByRole("status");
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

    it("keeps readable text content for assistive tech", () => {
      render(<StatusLed status="healthy" />);
      expect(screen.getByRole("status")).toHaveTextContent("OK");
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

  describe("motion style", () => {
    it("does not apply pulse animation classes for healthy state", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      expect(led.className).not.toContain("animate-[cf-led-pulse");
    });

    it("does not apply pulse animation classes for degraded state", () => {
      render(<StatusLed status="degraded" />);

      const led = screen.getByRole("status");
      expect(led.className).not.toContain("animate-[cf-led-pulse");
    });

    it("keeps offline state without pulse animation", () => {
      render(<StatusLed status="offline" />);

      const led = screen.getByRole("status");
      expect(led.className).not.toContain("animate-[cf-led-pulse");
    });
  });
});
