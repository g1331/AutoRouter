import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LogsTable } from "@/components/admin/logs-table";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RequestLog } from "@/types/api";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// Mock date-locale
vi.mock("@/lib/date-locale", () => ({
  getDateLocale: () => undefined,
}));

/**
 * Helper to render with TooltipProvider
 */
function renderWithTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

/**
 * LogsTable Component Tests
 *
 * Tests Cassette Futurism styling and data display.
 */
describe("LogsTable", () => {
  const mockLog: RequestLog = {
    id: "test-id-1",
    api_key_id: "key-1",
    upstream_id: "upstream-1",
    method: "POST",
    path: "/v1/chat/completions",
    model: "gpt-4",
    prompt_tokens: 100,
    completion_tokens: 200,
    total_tokens: 300,
    cached_tokens: 0,
    reasoning_tokens: 0,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    status_code: 200,
    duration_ms: 1500,
    error_message: null,
    created_at: new Date().toISOString(),
  };

  describe("Empty State", () => {
    it("renders empty state when no logs provided", () => {
      render(<LogsTable logs={[]} />);

      expect(screen.getByText("noLogs")).toBeInTheDocument();
      expect(screen.getByText("noLogsDesc")).toBeInTheDocument();
    });

    it("shows ScrollText icon in empty state", () => {
      render(<LogsTable logs={[]} />);

      // Icon is aria-hidden, check parent container exists
      const emptyContainer = screen.getByText("noLogs").closest("div");
      expect(emptyContainer).toBeInTheDocument();
    });
  });

  describe("Table Rendering", () => {
    it("renders table headers", () => {
      renderWithTooltip(<LogsTable logs={[mockLog]} />);

      expect(screen.getByText("tableTime")).toBeInTheDocument();
      expect(screen.getByText("tableMethod")).toBeInTheDocument();
      expect(screen.getByText("tablePath")).toBeInTheDocument();
      expect(screen.getByText("tableModel")).toBeInTheDocument();
      expect(screen.getByText("tableTokens")).toBeInTheDocument();
      expect(screen.getByText("tableStatus")).toBeInTheDocument();
      expect(screen.getByText("tableDuration")).toBeInTheDocument();
    });

    it("renders log data correctly", () => {
      renderWithTooltip(<LogsTable logs={[mockLog]} />);

      expect(screen.getByText("POST")).toBeInTheDocument();
      expect(screen.getByText("/v1/chat/completions")).toBeInTheDocument();
      expect(screen.getByText("gpt-4")).toBeInTheDocument();
    });
  });

  describe("Status Code Formatting", () => {
    it("renders success badge for 2xx status", () => {
      renderWithTooltip(<LogsTable logs={[{ ...mockLog, status_code: 200 }]} />);

      const badge = screen.getByText("200");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass("bg-status-success-muted");
      expect(badge).toHaveClass("text-status-success");
    });

    it("renders warning badge for 4xx status", () => {
      renderWithTooltip(<LogsTable logs={[{ ...mockLog, status_code: 400 }]} />);

      const badge = screen.getByText("400");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass("bg-status-warning-muted");
      expect(badge).toHaveClass("text-status-warning");
    });

    it("renders error badge for 5xx status", () => {
      renderWithTooltip(<LogsTable logs={[{ ...mockLog, status_code: 500 }]} />);

      const badge = screen.getByText("500");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass("bg-status-error-muted");
      expect(badge).toHaveClass("text-status-error");
    });

    it("renders dash for null status code", () => {
      renderWithTooltip(<LogsTable logs={[{ ...mockLog, status_code: null }]} />);

      // Find the dash in status column
      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  describe("Token Formatting", () => {
    it("renders total tokens with breakdown", () => {
      renderWithTooltip(<LogsTable logs={[mockLog]} />);

      // Total tokens
      expect(screen.getByText("300")).toBeInTheDocument();
      // Breakdown: prompt / completion
      expect(screen.getByText("100 / 200")).toBeInTheDocument();
    });

    it("renders dash for zero tokens", () => {
      const zeroTokenLog = {
        ...mockLog,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };
      renderWithTooltip(<LogsTable logs={[zeroTokenLog]} />);

      // Should have dash for tokens
      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThan(0);
    });

    it("formats large token numbers with locale separator", () => {
      const largeTokenLog = {
        ...mockLog,
        prompt_tokens: 10000,
        completion_tokens: 20000,
        total_tokens: 30000,
      };
      renderWithTooltip(<LogsTable logs={[largeTokenLog]} />);

      // Check for formatted number (locale-dependent, may be "30,000" or "30000")
      expect(screen.getByText(/30[,.]?000/)).toBeInTheDocument();
    });
  });

  describe("Duration Formatting", () => {
    it("renders milliseconds for durations under 1 second", () => {
      renderWithTooltip(<LogsTable logs={[{ ...mockLog, duration_ms: 500 }]} />);

      expect(screen.getByText("500ms")).toBeInTheDocument();
    });

    it("renders seconds for durations over 1 second", () => {
      renderWithTooltip(<LogsTable logs={[{ ...mockLog, duration_ms: 1500 }]} />);

      expect(screen.getByText("1.50s")).toBeInTheDocument();
    });

    it("renders dash for null duration", () => {
      renderWithTooltip(<LogsTable logs={[{ ...mockLog, duration_ms: null }]} />);

      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  describe("Error Row Styling", () => {
    it("applies error background for 4xx status", () => {
      renderWithTooltip(<LogsTable logs={[{ ...mockLog, status_code: 404 }]} />);

      const row = screen.getByRole("row", { name: /POST/ });
      expect(row).toHaveClass("bg-status-error-muted/20");
    });

    it("applies error background for 5xx status", () => {
      renderWithTooltip(<LogsTable logs={[{ ...mockLog, status_code: 503 }]} />);

      const row = screen.getByRole("row", { name: /POST/ });
      expect(row).toHaveClass("bg-status-error-muted/20");
    });

    it("does not apply error background for 2xx status", () => {
      renderWithTooltip(<LogsTable logs={[{ ...mockLog, status_code: 200 }]} />);

      const row = screen.getByRole("row", { name: /POST/ });
      expect(row).not.toHaveClass("bg-status-error-muted/20");
    });
  });

  describe("Null Values Handling", () => {
    it("renders dash for null method", () => {
      renderWithTooltip(<LogsTable logs={[{ ...mockLog, method: null }]} />);

      // Method column shows "-" in code element
      const codeElements = screen.getAllByRole("cell");
      const methodCell = codeElements[1]; // Second cell is method
      expect(methodCell).toHaveTextContent("-");
    });

    it("renders dash for null path", () => {
      renderWithTooltip(<LogsTable logs={[{ ...mockLog, path: null }]} />);

      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThan(0);
    });

    it("renders dash for null model", () => {
      renderWithTooltip(<LogsTable logs={[{ ...mockLog, model: null }]} />);

      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });
});
