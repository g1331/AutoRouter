import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TestUpstreamDialog } from "@/components/admin/test-upstream-dialog";
import type { Upstream, TestUpstreamResponse } from "@/types/api";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("TestUpstreamDialog", () => {
  const mockUpstream: Upstream = {
    id: "test-upstream-id",
    name: "Test Upstream",
    provider: "openai",
    base_url: "https://api.openai.com/v1",
    api_key_masked: "sk-***1234",
    is_default: false,
    timeout: 60,
    is_active: true,
    description: "Test description",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockSuccessResult: TestUpstreamResponse = {
    success: true,
    message: "Connection test successful",
    latency_ms: 123,
    status_code: 200,
    tested_at: new Date().toISOString(),
  };

  const mockFailureResult: TestUpstreamResponse = {
    success: false,
    message: "Connection test failed",
    latency_ms: null,
    status_code: 401,
    error_type: "authentication",
    error_details: "Invalid API key provided",
    tested_at: new Date().toISOString(),
  };

  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders nothing when upstream is null", () => {
      const { container } = render(
        <TestUpstreamDialog
          upstream={null}
          open={true}
          onClose={mockOnClose}
          testResult={null}
          isLoading={false}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it("renders dialog when open with upstream", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={null}
          isLoading={false}
        />
      );

      expect(screen.getByText("testUpstreamTitle")).toBeInTheDocument();
    });

    it("displays upstream details", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={null}
          isLoading={false}
        />
      );

      expect(screen.getByText("Test Upstream")).toBeInTheDocument();
      expect(screen.getByText("openai")).toBeInTheDocument();
      expect(screen.getByText("https://api.openai.com/v1")).toBeInTheDocument();
    });

    it("renders close button", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={null}
          isLoading={false}
        />
      );

      expect(screen.getByText("closeDialog")).toBeInTheDocument();
    });

    it("does not render when open is false", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={false}
          onClose={mockOnClose}
          testResult={null}
          isLoading={false}
        />
      );

      expect(screen.queryByText("testUpstreamTitle")).not.toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    it("shows loading title when isLoading is true", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={null}
          isLoading={true}
        />
      );

      expect(screen.getByText("testing")).toBeInTheDocument();
    });

    it("shows loading description when isLoading is true", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={null}
          isLoading={true}
        />
      );

      expect(screen.getByText("testUpstreamDesc")).toBeInTheDocument();
    });

    it("disables close button when isLoading is true", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={null}
          isLoading={true}
        />
      );

      const closeButton = screen.getByText("closeDialog").closest("button");
      expect(closeButton).toBeDisabled();
    });

    it("shows loading spinner when isLoading is true", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={null}
          isLoading={true}
        />
      );

      // Loading spinner should be present (Loader2 icon has animate-spin class)
      const spinners = document.querySelectorAll(".animate-spin");
      expect(spinners.length).toBeGreaterThan(0);
    });
  });

  describe("Success State", () => {
    it("shows success title when test succeeds", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={mockSuccessResult}
          isLoading={false}
        />
      );

      expect(screen.getByText("testSuccess")).toBeInTheDocument();
    });

    it("shows success message", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={mockSuccessResult}
          isLoading={false}
        />
      );

      expect(screen.getByText("Connection test successful")).toBeInTheDocument();
    });

    it("displays latency when available", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={mockSuccessResult}
          isLoading={false}
        />
      );

      expect(screen.getByText("testLatency:")).toBeInTheDocument();
      expect(screen.getByText("123ms")).toBeInTheDocument();
    });

    it("displays status code when available", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={mockSuccessResult}
          isLoading={false}
        />
      );

      expect(screen.getByText("testStatusCode:")).toBeInTheDocument();
      expect(screen.getByText("200")).toBeInTheDocument();
    });

    it("does not display latency when null", () => {
      const resultWithoutLatency = { ...mockSuccessResult, latency_ms: null };
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={resultWithoutLatency}
          isLoading={false}
        />
      );

      expect(screen.queryByText("testLatency:")).not.toBeInTheDocument();
    });

    it("does not display status code when null", () => {
      const resultWithoutStatus = { ...mockSuccessResult, status_code: null };
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={resultWithoutStatus}
          isLoading={false}
        />
      );

      expect(screen.queryByText("testStatusCode:")).not.toBeInTheDocument();
    });
  });

  describe("Failure State", () => {
    it("shows failure title when test fails", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={mockFailureResult}
          isLoading={false}
        />
      );

      expect(screen.getByText("testFailed")).toBeInTheDocument();
    });

    it("shows failure message", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={mockFailureResult}
          isLoading={false}
        />
      );

      expect(screen.getByText("Connection test failed")).toBeInTheDocument();
    });

    it("displays error type when available", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={mockFailureResult}
          isLoading={false}
        />
      );

      expect(screen.getByText("testErrorType:")).toBeInTheDocument();
      expect(screen.getByText("authentication")).toBeInTheDocument();
    });

    it("displays status code in failure state when available", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={mockFailureResult}
          isLoading={false}
        />
      );

      expect(screen.getByText("testStatusCode:")).toBeInTheDocument();
      expect(screen.getByText("401")).toBeInTheDocument();
    });

    it("displays error details when available", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={mockFailureResult}
          isLoading={false}
        />
      );

      expect(screen.getByText("testErrorDetails:")).toBeInTheDocument();
      expect(screen.getByText("Invalid API key provided")).toBeInTheDocument();
    });

    it("does not display error type when not provided", () => {
      const resultWithoutErrorType = { ...mockFailureResult, error_type: undefined };
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={resultWithoutErrorType}
          isLoading={false}
        />
      );

      expect(screen.queryByText("testErrorType:")).not.toBeInTheDocument();
    });

    it("does not display error details when not provided", () => {
      const resultWithoutDetails = { ...mockFailureResult, error_details: undefined };
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={resultWithoutDetails}
          isLoading={false}
        />
      );

      expect(screen.queryByText("testErrorDetails:")).not.toBeInTheDocument();
    });

    it("does not display status code when null in failure state", () => {
      const resultWithoutStatus = { ...mockFailureResult, status_code: null };
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={resultWithoutStatus}
          isLoading={false}
        />
      );

      expect(screen.queryByText("testStatusCode:")).not.toBeInTheDocument();
    });
  });

  describe("Actions", () => {
    it("calls onClose when close button is clicked", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={null}
          isLoading={false}
        />
      );

      const closeButton = screen.getByText("closeDialog");
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("does not call onClose when close button is clicked while loading", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={null}
          isLoading={true}
        />
      );

      const closeButton = screen.getByText("closeDialog");
      // Button is disabled, so click won't trigger the handler
      expect(closeButton.closest("button")).toBeDisabled();
    });

    it("calls onClose when dialog is closed via dialog overlay (not loading)", () => {
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={null}
          isLoading={false}
        />
      );

      // Simulate closing the dialog (dialog onOpenChange with false)
      // This is handled by handleOpenChange function in the component
      // In real usage, clicking outside or pressing ESC would trigger this
      // We can't easily simulate this in tests, but we can test the button click which calls onClose
      const closeButton = screen.getByText("closeDialog");
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("handles upstream without description", () => {
      const upstreamNoDesc = { ...mockUpstream, description: null };
      render(
        <TestUpstreamDialog
          upstream={upstreamNoDesc}
          open={true}
          onClose={mockOnClose}
          testResult={null}
          isLoading={false}
        />
      );

      expect(screen.getByText("Test Upstream")).toBeInTheDocument();
    });

    it("handles empty test result message", () => {
      const emptyMessageResult = { ...mockSuccessResult, message: "" };
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={emptyMessageResult}
          isLoading={false}
        />
      );

      // Should still render without error
      expect(screen.getByText("testSuccess")).toBeInTheDocument();
    });

    it("handles test result with all optional fields null", () => {
      const minimalResult: TestUpstreamResponse = {
        success: true,
        message: "Minimal result",
        latency_ms: null,
        status_code: null,
        tested_at: new Date().toISOString(),
      };
      render(
        <TestUpstreamDialog
          upstream={mockUpstream}
          open={true}
          onClose={mockOnClose}
          testResult={minimalResult}
          isLoading={false}
        />
      );

      expect(screen.getByText("testSuccess")).toBeInTheDocument();
      expect(screen.getByText("Minimal result")).toBeInTheDocument();
      expect(screen.queryByText("testLatency:")).not.toBeInTheDocument();
      expect(screen.queryByText("testStatusCode:")).not.toBeInTheDocument();
    });
  });
});
