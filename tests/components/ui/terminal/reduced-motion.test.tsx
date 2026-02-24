import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusLed } from "@/components/ui/terminal/status-led";
import { TerminalHeader } from "@/components/ui/terminal/terminal-header";

/**
 * Reduced Motion Support Tests
 *
 * Verifies that animations respect prefers-reduced-motion preference.
 * The components use Tailwind's motion-safe: prefix which only applies
 * animations when the user hasn't requested reduced motion.
 */
describe("Reduced Motion Support", () => {
  describe("StatusLed", () => {
    it("does not rely on motion-safe animation classes", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      expect(led.className).not.toContain("motion-safe:");
    });

    it("healthy state has no pulse animation class", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      expect(led.className).not.toContain("animate-[cf-led-pulse");
    });

    it("degraded state has no pulse animation class", () => {
      render(<StatusLed status="degraded" />);

      const led = screen.getByRole("status");
      expect(led.className).not.toContain("animate-[cf-led-pulse");
    });

    it("offline state has no animation", () => {
      render(<StatusLed status="offline" />);

      const led = screen.getByRole("status");
      expect(led.className).not.toContain("animate-[cf-led-pulse");
    });
  });

  describe("TerminalHeader", () => {
    it("live indicator remains visible without pulse animation", () => {
      render(<TerminalHeader systemId="test" isLive />);

      const recContainer = screen.getByText("REC").parentElement;
      const ledElement = recContainer?.querySelector("span");

      expect(ledElement?.textContent).toBe("●");
    });
  });

  describe("Static Visual Indicators", () => {
    it("status labels remain visible regardless of motion preference", () => {
      // Healthy
      const { rerender } = render(<StatusLed status="healthy" />);
      expect(screen.getByText("OK")).toBeInTheDocument();

      // Degraded
      rerender(<StatusLed status="degraded" />);
      expect(screen.getByText("WARN")).toBeInTheDocument();

      // Offline
      rerender(<StatusLed status="offline" />);
      expect(screen.getByText("DOWN")).toBeInTheDocument();
    });

    it("status tone classes remain visible regardless of motion preference", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      const marker = led.firstElementChild;

      expect(marker).toHaveClass("text-status-success");
    });

    it("status chip shape remains visible regardless of motion preference", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      const marker = led.firstElementChild as HTMLElement | null;

      expect(marker).toHaveClass("rounded-[6px]");
    });
  });

  describe("Accessibility Labels", () => {
    it("status information is available via aria-label regardless of animation", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      expect(led).toHaveAttribute("aria-label", "Status: healthy");
    });

    it("status content stays readable for assistive technologies", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      expect(led).toHaveTextContent("OK");
    });
  });
});
