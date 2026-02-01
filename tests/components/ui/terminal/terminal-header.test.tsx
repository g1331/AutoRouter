import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TerminalHeader } from "@/components/ui/terminal/terminal-header";

describe("TerminalHeader", () => {
  describe("system identifier", () => {
    it("displays system ID with SYS. prefix", () => {
      render(<TerminalHeader systemId="upstream_array" />);

      expect(screen.getByText("SYS.UPSTREAM_ARRAY")).toBeInTheDocument();
    });

    it("converts system ID to uppercase", () => {
      render(<TerminalHeader systemId="request_stream" />);

      expect(screen.getByText("SYS.REQUEST_STREAM")).toBeInTheDocument();
    });
  });

  describe("status indicators", () => {
    it("displays node count when provided", () => {
      render(<TerminalHeader systemId="test" nodeCount={5} />);

      expect(screen.getByText("[5 NODES]")).toBeInTheDocument();
    });

    it("displays time range when provided", () => {
      render(<TerminalHeader systemId="test" timeRange="30D" />);

      expect(screen.getByText("[30D]")).toBeInTheDocument();
    });

    it("displays request rate when provided", () => {
      render(<TerminalHeader systemId="test" requestRate={2.5} />);

      expect(screen.getByText("[↓ 2.5/s]")).toBeInTheDocument();
    });

    it("formats request rate to one decimal place", () => {
      render(<TerminalHeader systemId="test" requestRate={3.456} />);

      expect(screen.getByText("[↓ 3.5/s]")).toBeInTheDocument();
    });
  });

  describe("live indicator", () => {
    it("does not show live indicator by default", () => {
      render(<TerminalHeader systemId="test" />);

      expect(screen.queryByText("REC")).not.toBeInTheDocument();
    });

    it("shows live indicator when isLive is true", () => {
      render(<TerminalHeader systemId="test" isLive />);

      expect(screen.getByText("REC")).toBeInTheDocument();
    });

    it("shows pulsing LED with live indicator", () => {
      render(<TerminalHeader systemId="test" isLive />);

      // Find the container with REC text
      const recContainer = screen.getByText("REC").parentElement;
      expect(recContainer).toHaveTextContent("●");
    });
  });

  describe("children", () => {
    it("renders children in the left section", () => {
      render(
        <TerminalHeader systemId="test">
          <span data-testid="child">Custom Content</span>
        </TerminalHeader>
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
      expect(screen.getByText("Custom Content")).toBeInTheDocument();
    });
  });

  describe("styling", () => {
    it("applies custom className", () => {
      const { container } = render(<TerminalHeader systemId="test" className="custom-class" />);

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("has scanlines effect class", () => {
      const { container } = render(<TerminalHeader systemId="test" />);

      expect(container.firstChild).toHaveClass("cf-scanlines");
    });

    it("uses monospace font", () => {
      const { container } = render(<TerminalHeader systemId="test" />);

      expect(container.firstChild).toHaveClass("font-mono");
    });

    it("uses uppercase text", () => {
      const { container } = render(<TerminalHeader systemId="test" />);

      expect(container.firstChild).toHaveClass("uppercase");
    });
  });

  describe("multiple indicators", () => {
    it("displays all indicators when all props are provided", () => {
      render(
        <TerminalHeader systemId="test" nodeCount={10} timeRange="7D" requestRate={1.5} isLive />
      );

      expect(screen.getByText("SYS.TEST")).toBeInTheDocument();
      expect(screen.getByText("[10 NODES]")).toBeInTheDocument();
      expect(screen.getByText("[7D]")).toBeInTheDocument();
      expect(screen.getByText("[↓ 1.5/s]")).toBeInTheDocument();
      expect(screen.getByText("REC")).toBeInTheDocument();
    });
  });
});
