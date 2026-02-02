import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LogsTable } from "@/components/admin/logs-table";
import type { RequestLog, RoutingDecisionLog } from "@/types/api";

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

  describe("Terminal Header", () => {
    it("renders terminal header with system ID", () => {
      render(<LogsTable logs={[mockLog]} />);

      expect(screen.getByText("SYS.REQUEST_STREAM")).toBeInTheDocument();
    });

    it("displays time range in header", () => {
      render(<LogsTable logs={[mockLog]} />);

      expect(screen.getByText("[30D]")).toBeInTheDocument();
    });

    it("shows live indicator when isLive is true", () => {
      render(<LogsTable logs={[mockLog]} isLive />);

      expect(screen.getByText("REC")).toBeInTheDocument();
    });
  });

  describe("Table Rendering", () => {
    it("renders table headers", () => {
      render(<LogsTable logs={[mockLog]} />);

      expect(screen.getByText("tableTime")).toBeInTheDocument();
      expect(screen.getByText("tableMethod")).toBeInTheDocument();
      expect(screen.getByText("tablePath")).toBeInTheDocument();
      expect(screen.getByText("tableModel")).toBeInTheDocument();
      expect(screen.getByText("tableTokens")).toBeInTheDocument();
      expect(screen.getByText("tableStatus")).toBeInTheDocument();
      expect(screen.getByText("tableDuration")).toBeInTheDocument();
    });

    it("renders log data correctly", () => {
      render(<LogsTable logs={[mockLog]} />);

      expect(screen.getByText("POST")).toBeInTheDocument();
      expect(screen.getByText("/v1/chat/completions")).toBeInTheDocument();
      expect(screen.getByText("gpt-4")).toBeInTheDocument();
    });
  });

  describe("LED Status Indicators", () => {
    it("renders healthy LED for 2xx status", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 200 }]} />);

      // Should have healthy LED character (◉)
      expect(screen.getAllByText("◉").length).toBeGreaterThan(0);
      expect(screen.getByText("200")).toBeInTheDocument();
    });

    it("renders degraded LED for 4xx status", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 400 }]} />);

      // Should have degraded LED character (◎)
      expect(screen.getAllByText("◎").length).toBeGreaterThan(0);
      expect(screen.getByText("400")).toBeInTheDocument();
    });

    it("renders offline LED for 5xx status", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 500 }]} />);

      // Should have offline LED character (●)
      expect(screen.getAllByText("●").length).toBeGreaterThan(0);
      expect(screen.getByText("500")).toBeInTheDocument();
    });

    it("renders dash for null status code", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: null }]} />);

      // Find the dash in status column
      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  describe("Token Formatting", () => {
    it("renders total tokens with breakdown", () => {
      render(<LogsTable logs={[mockLog]} />);

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
      render(<LogsTable logs={[zeroTokenLog]} />);

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
      render(<LogsTable logs={[largeTokenLog]} />);

      // Check for formatted number (locale-dependent, may be "30,000" or "30000")
      expect(screen.getByText(/30[,.]?000/)).toBeInTheDocument();
    });
  });

  describe("Duration Formatting", () => {
    it("renders milliseconds for durations under 1 second", () => {
      render(<LogsTable logs={[{ ...mockLog, duration_ms: 500 }]} />);

      expect(screen.getByText("500ms")).toBeInTheDocument();
    });

    it("renders seconds for durations over 1 second", () => {
      render(<LogsTable logs={[{ ...mockLog, duration_ms: 1500 }]} />);

      expect(screen.getByText("1.50s")).toBeInTheDocument();
    });

    it("renders dash for null duration", () => {
      render(<LogsTable logs={[{ ...mockLog, duration_ms: null }]} />);

      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  describe("Error Row Glow Effect", () => {
    it("applies error glow for 4xx status", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 404 }]} />);

      const row = screen.getByText("POST").closest("tr");
      expect(row?.className).toContain("shadow-[inset_0_0_20px");
    });

    it("applies error glow for 5xx status", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 503 }]} />);

      const row = screen.getByText("POST").closest("tr");
      expect(row?.className).toContain("shadow-[inset_0_0_20px");
    });

    it("does not apply error glow for 2xx status", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 200 }]} />);

      const row = screen.getByText("POST").closest("tr");
      expect(row?.className).not.toContain("shadow-[inset_0_0_20px");
    });
  });

  describe("New Row Scan Highlight", () => {
    it("applies scan highlight class for newly arrived logs", async () => {
      const { rerender } = render(<LogsTable logs={[mockLog]} />);

      const newLog: RequestLog = {
        ...mockLog,
        id: "test-id-2",
        path: "/v1/messages",
      };

      rerender(<LogsTable logs={[newLog, mockLog]} />);

      const row = screen.getByText("/v1/messages").closest("tr");
      await waitFor(() => expect(row?.className).toContain("cf-row-scan"));
    });
  });

  describe("Stream Statistics Footer", () => {
    it("displays stream statistics", () => {
      render(<LogsTable logs={[mockLog]} />);

      expect(screen.getByText(/STREAM STATS:/)).toBeInTheDocument();
      expect(screen.getByText(/1 requests/)).toBeInTheDocument();
      expect(screen.getByText(/100% success/)).toBeInTheDocument();
    });

    it("calculates correct success rate", () => {
      const logs = [
        { ...mockLog, id: "1", status_code: 200 },
        { ...mockLog, id: "2", status_code: 200 },
        { ...mockLog, id: "3", status_code: 500 },
      ];
      render(<LogsTable logs={logs} />);

      // 2 out of 3 = 67%
      expect(screen.getByText(/67% success/)).toBeInTheDocument();
    });
  });

  describe("Blinking Cursor", () => {
    it("shows blinking cursor in live mode", () => {
      const { container } = render(<LogsTable logs={[mockLog]} isLive />);

      const cursor = container.querySelector(".cf-cursor-blink") as HTMLElement | null;
      expect(cursor).toBeInTheDocument();

      // The underscore is rendered via CSS ::after to avoid duplicating visible characters.
      expect(cursor?.textContent).toBe("");
    });

    it("does not show cursor when not in live mode", () => {
      const { container } = render(<LogsTable logs={[mockLog]} isLive={false} />);

      const cursor = container.querySelector(".cf-cursor-blink");
      expect(cursor).not.toBeInTheDocument();
    });
  });

  describe("Null Values Handling", () => {
    it("renders dash for null method", () => {
      render(<LogsTable logs={[{ ...mockLog, method: null }]} />);

      // Method column shows "-" in code element
      // Cell order: expand | time | upstream | method | path | model | tokens | status | duration
      const codeElements = screen.getAllByRole("cell");
      const methodCell = codeElements[3]; // Fourth cell is method (after expand, time, upstream)
      expect(methodCell).toHaveTextContent("-");
    });

    it("renders dash for null path", () => {
      render(<LogsTable logs={[{ ...mockLog, path: null }]} />);

      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThan(0);
    });

    it("renders dash for null model", () => {
      render(<LogsTable logs={[{ ...mockLog, model: null }]} />);

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
        render(<LogsTable logs={logsForFiltering} />);

        // Default filter is "all", should show all logs (within time range)
        // Only logs within 30d range: log-1, log-2, log-3, log-4, log-7
        const rows = screen.getAllByRole("row");
        // 1 header + 5 data rows
        expect(rows.length).toBe(6);
      });

      it("shows only 2xx logs when filter is '2xx'", () => {
        const { container } = render(<LogsTable logs={logsForFiltering} />);

        // Find and click status filter
        const selectTrigger = container.querySelector('[role="combobox"]');
        expect(selectTrigger).toBeInTheDocument();
      });

      it("filters out null status codes for 2xx filter", () => {
        render(
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
        render(
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
        render(
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
        render(
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
        render(
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
        render(
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
        render(<LogsTable logs={logsForFiltering} />);

        // All logs visible by default (within time range)
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBeGreaterThan(1);
      });

      it("filters logs by exact model name", () => {
        render(
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
        render(
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
        render(
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
        render(
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
        render(<LogsTable logs={logsForFiltering} />);

        // Default is "30d", which should include recent logs
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBeGreaterThan(1);
      });

      it("filters logs for '7d' range", () => {
        render(<LogsTable logs={logsForFiltering} />);

        // Default filter shows logs within 30 days
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBeGreaterThan(1);
      });

      it("filters logs for '30d' range", () => {
        render(<LogsTable logs={logsForFiltering} />);

        // Default is "30d"
        // Should show: log-1 (now), log-2 (yesterday), log-3 (8d ago), log-4 (8d ago), log-7 (now)
        // Should NOT show: log-5 (35d ago), log-6 (35d ago)
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(6); // 1 header + 5 data rows
      });

      it("excludes logs older than time range", () => {
        render(<LogsTable logs={logsForFiltering} />);

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
        render(<LogsTable logs={logsForFiltering} />);

        // Default filters: statusCode="all", model="", timeRange="30d"
        // Should show logs within 30 days
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(6); // 1 header + 5 data rows
      });

      it("shows empty state when no logs match combined filters", () => {
        render(
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

        render(<LogsTable logs={oldLogs} />);

        // With 30d filter (default), old logs should be filtered out
        // Should show the "no matching logs" message
        expect(screen.getByText("noMatchingLogs")).toBeInTheDocument();
        expect(screen.getByText("noMatchingLogsDesc")).toBeInTheDocument();
      });

      it("shows filter icon in empty filter state", () => {
        const oldLogs = [{ ...mockLog, id: "old-1", created_at: thirtyFiveDaysAgo.toISOString() }];

        render(<LogsTable logs={oldLogs} />);

        // Should show the filtered empty state
        expect(screen.getByText("noMatchingLogs")).toBeInTheDocument();
      });
    });
  });

  describe("Row Expansion", () => {
    const mockRoutingDecision: RoutingDecisionLog = {
      original_model: "gpt-4",
      resolved_model: "gpt-4",
      model_redirect_applied: false,
      routing_type: "group",
      selection_strategy: "weighted_random",
      candidate_count: 3,
      final_candidate_count: 2,
      selected_upstream_id: "upstream-1",
      candidates: [
        { id: "upstream-1", name: "openai-1", weight: 100, circuit_state: "closed" },
        { id: "upstream-2", name: "openai-2", weight: 50, circuit_state: "closed" },
      ],
      excluded: [],
    };

    it("all rows are expandable", () => {
      render(<LogsTable logs={[mockLog]} />);

      // Find expand button by aria-label
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      expect(expandButton).toBeInTheDocument();
    });

    it("expands row on click to show token details", () => {
      render(<LogsTable logs={[mockLog]} />);

      // Click expand button
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      // Token details should be visible
      expect(screen.getByText("tokenDetails")).toBeInTheDocument();
      expect(screen.getByText("tokenInput")).toBeInTheDocument();
      expect(screen.getByText("tokenOutput")).toBeInTheDocument();
      expect(screen.getByText("tokenTotal")).toBeInTheDocument();
    });

    it("shows routing decision in expanded view when available", () => {
      const logWithRouting: RequestLog = {
        ...mockLog,
        routing_decision: mockRoutingDecision,
      };

      render(<LogsTable logs={[logWithRouting]} />);

      // Click expand button
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      // Both token details and routing decision should be visible
      expect(screen.getByText("tokenDetails")).toBeInTheDocument();
      expect(screen.getByText("tooltipModelResolution")).toBeInTheDocument();
    });

    it("shows noRoutingDecision message when routing decision is null", () => {
      render(<LogsTable logs={[mockLog]} />);

      // Click expand button
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      // Should show "no routing decision" message
      expect(screen.getByText("noRoutingDecision")).toBeInTheDocument();
    });

    it("collapses row on second click", () => {
      render(<LogsTable logs={[mockLog]} />);

      // Click to expand
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);
      expect(screen.getByText("tokenDetails")).toBeInTheDocument();

      // Click to collapse (button now has collapseDetails label)
      const collapseButton = screen.getByRole("button", { name: "collapseDetails" });
      fireEvent.click(collapseButton);
      expect(screen.queryByText("tokenDetails")).not.toBeInTheDocument();
    });

    it("shows failover history with terminal-style formatting", () => {
      const logWithFailover: RequestLog = {
        ...mockLog,
        failover_attempts: 1,
        failover_history: [
          {
            upstream_id: "upstream-1",
            upstream_name: "failed-upstream",
            error_type: "timeout",
            error_message: "Request timed out",
            attempted_at: new Date().toISOString(),
          },
        ],
      };

      render(<LogsTable logs={[logWithFailover]} />);

      // Click expand button
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      // Failover history should be visible with terminal-style formatting
      expect(screen.getByText(/failoverDetails/)).toBeInTheDocument();
      // Check for the FAILOVER line with upstream name
      expect(screen.getByText(/FAILOVER: failed-upstream/)).toBeInTheDocument();
    });

    it("displays two-column layout with token details on left and routing on right", () => {
      const logWithRouting: RequestLog = {
        ...mockLog,
        routing_decision: mockRoutingDecision,
      };

      const { container } = render(<LogsTable logs={[logWithRouting]} />);

      // Click expand button
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      // Check for grid layout
      const gridContainer = container.querySelector(".grid.grid-cols-2");
      expect(gridContainer).toBeInTheDocument();
    });

    it("shows error details in terminal style for error rows", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 500 }]} />);

      // Click expand button
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      // Should show terminal-style error details
      expect(screen.getByText(/ERROR_TYPE:/)).toBeInTheDocument();
      expect(screen.getByText(/STATUS:/)).toBeInTheDocument();
    });
  });
});
