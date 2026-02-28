import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Topbar } from "@/components/admin/topbar";

describe("Topbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders the title in uppercase", () => {
      render(<Topbar title="Dashboard" />);

      expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
    });

    it("renders header element", () => {
      render(<Topbar title="Test" />);

      expect(screen.getByRole("banner")).toBeInTheDocument();
    });

    it("does not render deprecated status indicator", () => {
      render(<Topbar title="Test" />);

      expect(screen.queryByText("STATUS:")).not.toBeInTheDocument();
      expect(screen.queryByText("ONLINE")).not.toBeInTheDocument();
    });

    it("renders terminal prompt indicator", () => {
      render(<Topbar title="Test" />);

      expect(screen.getByText(">>", { exact: false })).toBeInTheDocument();
    });
  });

  describe("Title Variants", () => {
    it("handles lowercase title", () => {
      render(<Topbar title="api keys" />);

      expect(screen.getByText("API KEYS")).toBeInTheDocument();
    });

    it("handles mixed case title", () => {
      render(<Topbar title="UpStreams" />);

      expect(screen.getByText("UPSTREAMS")).toBeInTheDocument();
    });

    it("handles empty title", () => {
      render(<Topbar title="" />);

      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent("");
    });
  });
});
