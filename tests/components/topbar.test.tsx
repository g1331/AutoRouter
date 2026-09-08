import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Topbar } from "@/components/admin/topbar";

describe("Topbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("preserves the localized title", () => {
      render(<Topbar title="Dashboard" />);

      expect(screen.getByText("Dashboard")).toBeInTheDocument();
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

    it("omits decorative terminal labels", () => {
      render(<Topbar title="Test" />);

      expect(screen.queryByText(">>")).not.toBeInTheDocument();
    });
  });

  describe("Title Variants", () => {
    it("handles lowercase title", () => {
      render(<Topbar title="api keys" />);

      expect(screen.getByText("api keys")).toBeInTheDocument();
    });

    it("handles mixed case title", () => {
      render(<Topbar title="UpStreams" />);

      expect(screen.getByText("UpStreams")).toBeInTheDocument();
    });

    it("handles empty title", () => {
      render(<Topbar title="" />);

      expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    });
  });
});
