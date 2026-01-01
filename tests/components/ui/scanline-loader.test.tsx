import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ScanlineLoader } from "@/components/ui/scanline-loader";

describe("ScanlineLoader", () => {
  describe("Rendering", () => {
    it("renders a loader with status role", () => {
      render(<ScanlineLoader />);

      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("has default aria-label of Loading", () => {
      render(<ScanlineLoader />);

      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
    });

    it("uses custom text as aria-label", () => {
      render(<ScanlineLoader text="Please wait" />);

      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Please wait");
    });
  });

  describe("Text", () => {
    it("does not render text by default", () => {
      render(<ScanlineLoader />);

      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    it("renders text when provided", () => {
      render(<ScanlineLoader text="Loading..." />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });
  });

  describe("Sizes", () => {
    it("renders with medium size by default", () => {
      const { container } = render(<ScanlineLoader />);

      const loaderBox = container.querySelector(".w-12.h-12");
      expect(loaderBox).toBeInTheDocument();
    });

    it("renders with small size", () => {
      const { container } = render(<ScanlineLoader size="sm" />);

      const loaderBox = container.querySelector(".w-8.h-8");
      expect(loaderBox).toBeInTheDocument();
    });

    it("renders with large size", () => {
      const { container } = render(<ScanlineLoader size="lg" />);

      const loaderBox = container.querySelector(".w-16.h-16");
      expect(loaderBox).toBeInTheDocument();
    });
  });

  describe("Styling", () => {
    it("applies custom className", () => {
      render(<ScanlineLoader className="custom-class" />);

      expect(screen.getByRole("status")).toHaveClass("custom-class");
    });
  });
});
