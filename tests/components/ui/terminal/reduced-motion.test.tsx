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
    it("uses motion-safe prefix for pulse animations", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      const ledChar = led.querySelector("[aria-hidden='true']");

      // Animation class should use motion-safe prefix
      expect(ledChar?.className).toContain("motion-safe:");
    });

    it("healthy state animation uses motion-safe prefix", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      const ledChar = led.querySelector("[aria-hidden='true']");

      expect(ledChar?.className).toContain("motion-safe:animate-[cf-led-pulse_2s");
    });

    it("degraded state animation uses motion-safe prefix", () => {
      render(<StatusLed status="degraded" />);

      const led = screen.getByRole("status");
      const ledChar = led.querySelector("[aria-hidden='true']");

      expect(ledChar?.className).toContain("motion-safe:animate-[cf-led-pulse_1s");
    });

    it("offline state has no animation (static glow)", () => {
      render(<StatusLed status="offline" />);

      const led = screen.getByRole("status");
      const ledChar = led.querySelector("[aria-hidden='true']");

      // Offline state should not have animation class
      expect(ledChar?.className).not.toContain("animate-[cf-led-pulse");
    });
  });

  describe("TerminalHeader", () => {
    it("live indicator uses motion-safe prefix for pulse", () => {
      const { container } = render(<TerminalHeader systemId="test" isLive />);

      // Find the pulsing LED element
      const recContainer = screen.getByText("REC").parentElement;
      const ledElement = recContainer?.querySelector("span");

      expect(ledElement?.className).toContain("motion-safe:");
    });
  });

  describe("Animation Class Structure", () => {
    it("motion-safe prefix ensures animation only runs without reduced-motion", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      const ledChar = led.querySelector("[aria-hidden='true']");
      const className = ledChar?.className || "";

      // Verify the class structure follows Tailwind's motion-safe pattern
      // motion-safe:animate-[...] means animation only applies when
      // prefers-reduced-motion is not set to "reduce"
      expect(className).toMatch(/motion-safe:animate-\[/);
    });
  });

  describe("Static Visual Indicators", () => {
    it("LED characters remain visible regardless of motion preference", () => {
      // Healthy
      const { rerender } = render(<StatusLed status="healthy" />);
      expect(screen.getByText("◉")).toBeInTheDocument();

      // Degraded
      rerender(<StatusLed status="degraded" />);
      expect(screen.getByText("◎")).toBeInTheDocument();

      // Offline
      rerender(<StatusLed status="offline" />);
      expect(screen.getByText("●")).toBeInTheDocument();
    });

    it("LED colors remain visible regardless of motion preference", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      // Color class is on the inner character span
      const charSpan = led.querySelector("[aria-hidden='true'] .text-status-success");

      // Color classes should not be conditional on motion
      expect(charSpan).toBeInTheDocument();
    });

    it("glow effects remain visible regardless of motion preference", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      // Glow is now via box-shadow on a rounded-full span
      const glowSpan = led.querySelector(".rounded-full") as HTMLElement;

      // Glow (box-shadow via style) should not be conditional on motion
      expect(glowSpan?.style.boxShadow).toBeTruthy();
    });
  });

  describe("Accessibility Labels", () => {
    it("status information is available via aria-label regardless of animation", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      expect(led).toHaveAttribute("aria-label", "Status: healthy");
    });

    it("LED character is marked aria-hidden (decorative)", () => {
      render(<StatusLed status="healthy" />);

      const led = screen.getByRole("status");
      const ledChar = led.querySelector("[aria-hidden='true']");

      expect(ledChar).toBeInTheDocument();
    });
  });
});
