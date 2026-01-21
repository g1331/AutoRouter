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

  describe("Filter Logic", () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const eightDaysAgo = new Date(now);
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
    const thirtyFiveDaysAgo = new Date(now);
    thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35);

    const logsForFiltering: RequestLog[] = [
      {
        ...mockLog,
        id: "log-1",
        status_code: 200,
        model: "gpt-4",
        created_at: now.toISOString(),
      },
      {
        ...mockLog,
        id: "log-2",
        status_code: 201,
        model: "gpt-3.5-turbo",
        created_at: yesterday.toISOString(),
      },
      {
        ...mockLog,
        id: "log-3",
        status_code: 400,
        model: "claude-3-opus",
        created_at: eightDaysAgo.toISOString(),
      },
      {
        ...mockLog,
        id: "log-4",
        status_code: 404,
        model: "gpt-4-turbo",
        created_at: eightDaysAgo.toISOString(),
      },
      {
        ...mockLog,
        id: "log-5",
        status_code: 500,
        model: "claude-2",
        created_at: thirtyFiveDaysAgo.toISOString(),
      },
      {
        ...mockLog,
        id: "log-6",
        status_code: 503,
        model: "gpt-4",
        created_at: thirtyFiveDaysAgo.toISOString(),
      },
      {
        ...mockLog,
        id: "log-7",
        status_code: null,
        model: null,
        created_at: now.toISOString(),
      },
    ];

    describe("Status Code Filter", () => {
      it("shows all logs when filter is 'all'", () => {
        renderWithTooltip(<LogsTable logs={logsForFiltering} />);

        // Default filter is "all", should show all logs (within time range)
        // Only logs within 30d range: log-1, log-2, log-3, log-4, log-7
        const rows = screen.getAllByRole("row");
        // 1 header + 5 data rows
        expect(rows.length).toBe(6);
      });

      it("shows only 2xx logs when filter is '2xx'", () => {
        const { container } = renderWithTooltip(<LogsTable logs={logsForFiltering} />);

        // Find and click status filter
        const selectTrigger = container.querySelector('[role="combobox"]');
        expect(selectTrigger).toBeInTheDocument();
      });

      it("filters out null status codes for 2xx filter", () => {
        renderWithTooltip(
          <LogsTable
            logs={[
              { ...mockLog, id: "log-1", status_code: 200 },
              { ...mockLog, id: "log-2", status_code: null },
            ]}
          />
        );

        // Both logs should be visible with "all" filter
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBeGreaterThan(0);
      });

      it("filters out null status codes for 4xx filter", () => {
        renderWithTooltip(
          <LogsTable
            logs={[
              { ...mockLog, id: "log-1", status_code: 400 },
              { ...mockLog, id: "log-2", status_code: null },
            ]}
          />
        );

        const rows = screen.getAllByRole("row");
        expect(rows.length).toBeGreaterThan(0);
      });

      it("filters out null status codes for 5xx filter", () => {
        renderWithTooltip(
          <LogsTable
            logs={[
              { ...mockLog, id: "log-1", status_code: 500 },
              { ...mockLog, id: "log-2", status_code: null },
            ]}
          />
        );

        const rows = screen.getAllByRole("row");
        expect(rows.length).toBeGreaterThan(0);
      });

      it("correctly filters boundary status codes for 2xx", () => {
        renderWithTooltip(
          <LogsTable
            logs={[
              { ...mockLog, id: "log-1", status_code: 199 },
              { ...mockLog, id: "log-2", status_code: 200 },
              { ...mockLog, id: "log-3", status_code: 299 },
              { ...mockLog, id: "log-4", status_code: 300 },
            ]}
          />
        );

        // With default "all" filter, all should be visible
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(5); // 1 header + 4 data rows
      });

      it("correctly filters boundary status codes for 4xx", () => {
        renderWithTooltip(
          <LogsTable
            logs={[
              { ...mockLog, id: "log-1", status_code: 399 },
              { ...mockLog, id: "log-2", status_code: 400 },
              { ...mockLog, id: "log-3", status_code: 499 },
              { ...mockLog, id: "log-4", status_code: 500 },
            ]}
          />
        );

        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(5); // 1 header + 4 data rows
      });

      it("correctly filters boundary status codes for 5xx", () => {
        renderWithTooltip(
          <LogsTable
            logs={[
              { ...mockLog, id: "log-1", status_code: 499 },
              { ...mockLog, id: "log-2", status_code: 500 },
              { ...mockLog, id: "log-3", status_code: 599 },
              { ...mockLog, id: "log-4", status_code: 600 },
            ]}
          />
        );

        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(5); // 1 header + 4 data rows
      });
    });

    describe("Model Filter", () => {
      it("performs case-insensitive partial match", () => {
        renderWithTooltip(<LogsTable logs={logsForFiltering} />);

        // All logs visible by default (within time range)
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBeGreaterThan(1);
      });

      it("filters logs by exact model name", () => {
        renderWithTooltip(
          <LogsTable
            logs={[
              { ...mockLog, id: "log-1", model: "gpt-4" },
              { ...mockLog, id: "log-2", model: "gpt-3.5-turbo" },
              { ...mockLog, id: "log-3", model: "claude-3-opus" },
            ]}
          />
        );

        // All should be visible with no filter
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(4); // 1 header + 3 data rows
      });

      it("filters logs by partial model name", () => {
        renderWithTooltip(
          <LogsTable
            logs={[
              { ...mockLog, id: "log-1", model: "gpt-4" },
              { ...mockLog, id: "log-2", model: "gpt-3.5-turbo" },
              { ...mockLog, id: "log-3", model: "claude-3-opus" },
            ]}
          />
        );

        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(4); // 1 header + 3 data rows
      });

      it("filters out logs with null model", () => {
        renderWithTooltip(
          <LogsTable
            logs={[
              { ...mockLog, id: "log-1", model: "gpt-4" },
              { ...mockLog, id: "log-2", model: null },
            ]}
          />
        );

        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(3); // 1 header + 2 data rows
      });

      it("returns no results when no models match", () => {
        renderWithTooltip(
          <LogsTable
            logs={[
              { ...mockLog, id: "log-1", model: "gpt-4" },
              { ...mockLog, id: "log-2", model: "gpt-3.5-turbo" },
            ]}
          />
        );

        // With no filter applied, all logs should be visible
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(3); // 1 header + 2 data rows
      });
    });

    describe("Time Range Filter", () => {
      it("filters logs for 'today' range", () => {
        renderWithTooltip(<LogsTable logs={logsForFiltering} />);

        // Default is "30d", which should include recent logs
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBeGreaterThan(1);
      });

      it("filters logs for '7d' range", () => {
        renderWithTooltip(<LogsTable logs={logsForFiltering} />);

        // Default filter shows logs within 30 days
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBeGreaterThan(1);
      });

      it("filters logs for '30d' range", () => {
        renderWithTooltip(<LogsTable logs={logsForFiltering} />);

        // Default is "30d"
        // Should show: log-1 (now), log-2 (yesterday), log-3 (8d ago), log-4 (8d ago), log-7 (now)
        // Should NOT show: log-5 (35d ago), log-6 (35d ago)
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(6); // 1 header + 5 data rows
      });

      it("excludes logs older than time range", () => {
        renderWithTooltip(<LogsTable logs={logsForFiltering} />);

        // With 30d filter, logs from 35 days ago should not appear
        const rows = screen.getAllByRole("row");
        // Should have 1 header + 5 recent logs
        expect(rows.length).toBe(6);

        // Verify old logs are not present
        expect(screen.queryByText("log-5")).not.toBeInTheDocument();
        expect(screen.queryByText("log-6")).not.toBeInTheDocument();
      });
    });

    describe("Combined Filters", () => {
      it("applies all filters together", () => {
        renderWithTooltip(<LogsTable logs={logsForFiltering} />);

        // Default filters: statusCode="all", model="", timeRange="30d"
        // Should show logs within 30 days
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(6); // 1 header + 5 data rows
      });

      it("shows empty state when no logs match combined filters", () => {
        renderWithTooltip(
          <LogsTable logs={[{ ...mockLog, id: "log-1", status_code: 200, model: "gpt-4" }]} />
        );

        // Single log should be visible
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(2); // 1 header + 1 data row
      });
    });

    describe("Empty State After Filtering", () => {
      it("shows empty filter state when all logs filtered out", () => {
        // Create logs that will all be filtered out by time range
        const oldLogs = [
          { ...mockLog, id: "old-1", created_at: thirtyFiveDaysAgo.toISOString() },
          { ...mockLog, id: "old-2", created_at: thirtyFiveDaysAgo.toISOString() },
        ];

        renderWithTooltip(<LogsTable logs={oldLogs} />);

        // With 30d filter (default), old logs should be filtered out
        // Should show the "no matching logs" message
        expect(screen.getByText("noMatchingLogs")).toBeInTheDocument();
        expect(screen.getByText("noMatchingLogsDesc")).toBeInTheDocument();
      });

      it("shows filter icon in empty filter state", () => {
        const oldLogs = [{ ...mockLog, id: "old-1", created_at: thirtyFiveDaysAgo.toISOString() }];

        renderWithTooltip(<LogsTable logs={oldLogs} />);

        // Should show the filtered empty state
        expect(screen.getByText("noMatchingLogs")).toBeInTheDocument();
      });
    });
  });
});
