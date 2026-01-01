import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ErrorState } from "@/components/ui/error-state";

// Mock lucide-react
vi.mock("lucide-react", () => ({
  OctagonAlert: () => <svg data-testid="error-icon" />,
  RefreshCw: ({ className }: { className?: string }) => (
    <svg data-testid="refresh-icon" className={className} />
  ),
}));

describe("ErrorState", () => {
  describe("Rendering", () => {
    it("renders with default props", () => {
      render(<ErrorState />);

      expect(screen.getByText("[ERROR] SYSTEM ERROR")).toBeInTheDocument();
      expect(screen.getByText("An error occurred. Please try again.")).toBeInTheDocument();
    });

    it("renders with custom title", () => {
      render(<ErrorState title="CONNECTION FAILED" />);

      expect(screen.getByText("[ERROR] CONNECTION FAILED")).toBeInTheDocument();
    });

    it("renders with custom description", () => {
      render(<ErrorState description="Unable to connect to the server." />);

      expect(screen.getByText("Unable to connect to the server.")).toBeInTheDocument();
    });

    it("renders error icon", () => {
      render(<ErrorState />);

      expect(screen.getByTestId("error-icon")).toBeInTheDocument();
    });

    it("has alert role", () => {
      render(<ErrorState />);

      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("applies custom className", () => {
      render(<ErrorState className="custom-class" />);

      const alert = screen.getByRole("alert");
      expect(alert).toHaveClass("custom-class");
    });
  });

  describe("Retry Button", () => {
    it("does not render retry button when onRetry is not provided", () => {
      render(<ErrorState />);

      expect(screen.queryByText("RETRY")).not.toBeInTheDocument();
    });

    it("renders retry button when onRetry is provided", () => {
      render(<ErrorState onRetry={() => {}} />);

      expect(screen.getByText("RETRY")).toBeInTheDocument();
    });

    it("calls onRetry when retry button is clicked", () => {
      const mockRetry = vi.fn();
      render(<ErrorState onRetry={mockRetry} />);

      fireEvent.click(screen.getByText("RETRY"));

      expect(mockRetry).toHaveBeenCalledTimes(1);
    });

    it("shows RETRYING text when isRetrying is true", () => {
      render(<ErrorState onRetry={() => {}} isRetrying={true} />);

      expect(screen.getByText("RETRYING...")).toBeInTheDocument();
      expect(screen.queryByText("RETRY")).not.toBeInTheDocument();
    });

    it("disables retry button when isRetrying", () => {
      render(<ErrorState onRetry={() => {}} isRetrying={true} />);

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("renders refresh icon", () => {
      render(<ErrorState onRetry={() => {}} />);

      expect(screen.getByTestId("refresh-icon")).toBeInTheDocument();
    });

    it("adds animate-spin class when retrying", () => {
      render(<ErrorState onRetry={() => {}} isRetrying={true} />);

      const icon = screen.getByTestId("refresh-icon");
      expect(icon).toHaveClass("animate-spin");
    });
  });
});
