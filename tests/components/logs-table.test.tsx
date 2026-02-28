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
    upstream_name: "upstream-1",
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
    routing_duration_ms: null,
    error_message: null,
    routing_type: null,
    group_name: null,
    lb_strategy: null,
    failover_attempts: 0,
    failover_history: null,
    routing_decision: null,
    priority_tier: null,
    session_id: null,
    affinity_hit: false,
    affinity_migrated: false,
    ttft_ms: null,
    is_stream: false,
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

  describe("Legacy Header Removal", () => {
    it("does not render SYS/REC/request-rate header strip", () => {
      render(<LogsTable logs={[mockLog]} isLive />);

      expect(screen.queryByText("SYS.REQUEST_STREAM")).not.toBeInTheDocument();
      expect(screen.queryByText("[30D]")).not.toBeInTheDocument();
      expect(screen.queryByText("REC")).not.toBeInTheDocument();
      expect(screen.queryByText(/\[↓\s*0\.0\/s\]/)).not.toBeInTheDocument();
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
      expect(screen.getByText("tableCost")).toBeInTheDocument();
      expect(screen.getByText("tableStatus")).toBeInTheDocument();
      expect(screen.getByText("tableDuration")).toBeInTheDocument();
    });

    it("renders log data correctly", () => {
      render(<LogsTable logs={[mockLog]} />);

      expect(screen.getByText("POST")).toBeInTheDocument();
      expect(screen.getByText("/v1/chat/completions")).toBeInTheDocument();
      expect(screen.getByText("gpt-4")).toBeInTheDocument();
    });

    it("renders billed cost directly in the table row", () => {
      render(
        <LogsTable
          logs={[
            {
              ...mockLog,
              billing_status: "billed",
              final_cost: 1.234,
              currency: "USD",
            },
          ]}
        />
      );

      expect(screen.getByText(/\$1\.234/)).toBeInTheDocument();
    });
  });

  describe("Upstream Display", () => {
    it("shows upstreamUnknown when upstream_id exists but upstream_name is null", () => {
      render(<LogsTable logs={[{ ...mockLog, upstream_name: null }]} />);

      expect(screen.getByText("upstreamUnknown")).toBeInTheDocument();
    });

    it("shows dash when upstream_id is null", () => {
      render(<LogsTable logs={[{ ...mockLog, upstream_id: null, upstream_name: null }]} />);

      const cells = screen.getAllByRole("cell");
      const upstreamCell = cells[2]; // expand | time | upstream
      expect(upstreamCell).toHaveTextContent("-");
    });
  });

  describe("Status Indicators", () => {
    it("renders success status badge for 2xx status", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 200 }]} />);

      const badge = screen.getByText("200");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("bg-status-success-muted");
    });

    it("renders warning status badge for 4xx status", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 400 }]} />);

      const badge = screen.getByText("400");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("bg-status-warning-muted");
    });

    it("renders error status badge for 5xx status", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 500 }]} />);

      const badge = screen.getByText("500");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("bg-status-error-muted");
    });

    it("renders dash for null status code", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: null }]} />);

      const dashBadges = screen
        .getAllByText("-")
        .filter(
          (el) => el.className.includes("bg-surface-200") && el.className.includes("font-mono")
        );
      expect(dashBadges.length).toBeGreaterThan(0);
    });

    it("renders status badge with monospace alignment classes", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 500 }]} />);

      const badge = screen.getByText("500");
      expect(badge.className).toContain("font-mono");
      expect(badge.className).toContain("tabular-nums");
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

  describe("TTFT Formatting", () => {
    it("renders seconds with three decimals for TTFT over 1000ms", () => {
      render(<LogsTable logs={[{ ...mockLog, ttft_ms: 1222 }]} />);

      const ttft = screen.getByText("1.222s");
      expect(ttft).toBeInTheDocument();
      expect(ttft.className).toContain("text-status-error");
    });

    it("renders milliseconds for TTFT under 1000ms", () => {
      render(<LogsTable logs={[{ ...mockLog, ttft_ms: 650 }]} />);

      const ttft = screen.getByText("650ms");
      expect(ttft).toBeInTheDocument();
      expect(ttft.className).toContain("text-status-warning");
    });

    it("uses success color for fast TTFT", () => {
      render(<LogsTable logs={[{ ...mockLog, ttft_ms: 220 }]} />);

      const ttft = screen.getByText("220ms");
      expect(ttft).toBeInTheDocument();
      expect(ttft.className).toContain("text-status-success");
    });

    it("does not render short-sample hint in row performance line", () => {
      const shortSampleLog: RequestLog = {
        ...mockLog,
        is_stream: true,
        duration_ms: 1650,
        routing_duration_ms: 300,
        ttft_ms: 900,
        completion_tokens: 40,
      };
      render(<LogsTable logs={[shortSampleLog]} />);

      expect(screen.queryByText("perfSampleShort")).not.toBeInTheDocument();
    });

    it("shows generation time in expanded details", () => {
      const streamLog: RequestLog = {
        ...mockLog,
        is_stream: true,
        duration_ms: 1650,
        routing_duration_ms: 300,
        ttft_ms: 900,
        completion_tokens: 40,
      };
      render(<LogsTable logs={[streamLog]} />);

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));
      expect(screen.queryAllByText(/perfGen/).length).toBeGreaterThan(0);
      expect(screen.queryAllByText("450ms").length).toBeGreaterThan(0);
    });

    it("does not show TPS when completion tokens are below threshold", () => {
      const streamLog: RequestLog = {
        ...mockLog,
        is_stream: true,
        duration_ms: 1650,
        routing_duration_ms: 300,
        ttft_ms: 900,
        completion_tokens: 9,
      };
      render(<LogsTable logs={[streamLog]} />);

      expect(screen.queryByText("perfTps")).not.toBeInTheDocument();
    });

    it("does not show TPS when duration is too short", () => {
      const streamLog: RequestLog = {
        ...mockLog,
        is_stream: true,
        duration_ms: 100,
        routing_duration_ms: 1000,
        ttft_ms: 400,
        completion_tokens: 100,
      };
      render(<LogsTable logs={[streamLog]} />);

      expect(screen.queryByText("perfTps")).not.toBeInTheDocument();
    });
  });

  describe("Error Row Styling", () => {
    it("applies subtle error accent for 4xx status", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 404 }]} />);

      const row = screen.getByText("POST").closest("tr");
      expect(row?.className).toContain("border-l-2");
      expect(row?.className).toContain("border-l-status-error/45");
      expect(row?.className).not.toContain("shadow-[inset_0_0_20px");
    });

    it("applies subtle error accent for 5xx status", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 503 }]} />);

      const row = screen.getByText("POST").closest("tr");
      expect(row?.className).toContain("border-l-2");
      expect(row?.className).toContain("border-l-status-error/45");
      expect(row?.className).not.toContain("shadow-[inset_0_0_20px");
    });

    it("does not apply error accent for 2xx status", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 200 }]} />);

      const row = screen.getByText("POST").closest("tr");
      expect(row?.className).not.toContain("border-l-2");
      expect(row?.className).not.toContain("border-l-status-error/45");
      expect(row?.className).not.toContain("shadow-[inset_0_0_20px");
    });
  });

  describe("New Row Highlight", () => {
    it("applies subtle highlight class for newly arrived logs", async () => {
      const { rerender } = render(<LogsTable logs={[mockLog]} />);

      const newLog: RequestLog = {
        ...mockLog,
        id: "test-id-2",
        path: "/v1/messages",
      };

      rerender(<LogsTable logs={[newLog, mockLog]} />);

      const row = screen.getByText("/v1/messages").closest("tr");
      await waitFor(() => expect(row?.className).toContain("bg-status-info-muted/25"));
    });
  });

  describe("Performance Summary And Quick Filters", () => {
    it("renders performance summary tiles", () => {
      render(<LogsTable logs={[mockLog]} />);

      expect(screen.getByText("summaryP50Ttft")).toBeInTheDocument();
      expect(screen.getByText("summaryP90Ttft")).toBeInTheDocument();
      expect(screen.getByText("summaryP50Tps")).toBeInTheDocument();
      expect(screen.getByText("summarySlowRatio")).toBeInTheDocument();
      expect(screen.getByText("summaryStreamRatio")).toBeInTheDocument();
    });

    it("filters to high TTFT logs with quick filter preset", () => {
      const highTtftLog: RequestLog = {
        ...mockLog,
        id: "high-ttft",
        path: "/v1/high-ttft",
        is_stream: true,
        ttft_ms: 6000,
        duration_ms: 12000,
        routing_duration_ms: 300,
        completion_tokens: 120,
      };
      const normalLog: RequestLog = {
        ...mockLog,
        id: "normal-ttft",
        path: "/v1/normal-ttft",
        is_stream: true,
        ttft_ms: 400,
        duration_ms: 3500,
        routing_duration_ms: 250,
        completion_tokens: 120,
      };

      render(<LogsTable logs={[highTtftLog, normalLog]} />);

      fireEvent.click(screen.getByRole("button", { name: "presetHighTtft" }));

      expect(screen.getByText("/v1/high-ttft")).toBeInTheDocument();
      expect(screen.queryByText("/v1/normal-ttft")).not.toBeInTheDocument();
    });

    it("filters to low TPS logs with quick filter preset", () => {
      const lowTpsLog: RequestLog = {
        ...mockLog,
        id: "low-tps",
        path: "/v1/low-tps",
        is_stream: true,
        duration_ms: 5000,
        routing_duration_ms: 500,
        ttft_ms: 1000,
        completion_tokens: 20,
      };
      const highTpsLog: RequestLog = {
        ...mockLog,
        id: "high-tps",
        path: "/v1/high-tps",
        is_stream: true,
        duration_ms: 1500,
        routing_duration_ms: 200,
        ttft_ms: 200,
        completion_tokens: 200,
      };

      render(<LogsTable logs={[lowTpsLog, highTpsLog]} />);
      fireEvent.click(screen.getByRole("button", { name: "presetLowTps" }));

      expect(screen.getByText("/v1/low-tps")).toBeInTheDocument();
      expect(screen.queryByText("/v1/high-tps")).not.toBeInTheDocument();
    });

    it("filters to slow duration logs with quick filter preset", () => {
      const slowLog: RequestLog = {
        ...mockLog,
        id: "slow-duration",
        path: "/v1/slow-duration",
        duration_ms: 25000,
      };
      const fastLog: RequestLog = {
        ...mockLog,
        id: "fast-duration",
        path: "/v1/fast-duration",
        duration_ms: 5000,
      };

      render(<LogsTable logs={[slowLog, fastLog]} />);
      fireEvent.click(screen.getByRole("button", { name: "presetSlowDuration" }));

      expect(screen.getByText("/v1/slow-duration")).toBeInTheDocument();
      expect(screen.queryByText("/v1/fast-duration")).not.toBeInTheDocument();
    });
  });

  describe("Legacy Footer Removal", () => {
    it("does not render legacy live and stream stats footer text", () => {
      render(<LogsTable logs={[mockLog]} isLive />);
      expect(screen.queryByText("LIVE")).not.toBeInTheDocument();
      expect(screen.queryByText(/STREAM STATS:/)).not.toBeInTheDocument();
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

        const input = screen.getByPlaceholderText("filterModel");
        fireEvent.change(input, { target: { value: "claude" } });

        expect(screen.getByText("claude-3-opus")).toBeInTheDocument();
        expect(screen.queryByText("gpt-4")).not.toBeInTheDocument();
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

    const attemptedAt = "2026-02-02T00:00:00.000Z";
    const logWithFailoverBase: RequestLog = {
      ...mockLog,
      failover_attempts: 1,
      failover_history: [
        {
          upstream_id: "upstream-1",
          upstream_name: "failed-upstream",
          error_type: "timeout",
          error_message: "Request timed out",
          attempted_at: attemptedAt,
        },
      ],
    };

    it("shows expand indicator when token details exist even without failover", () => {
      render(<LogsTable logs={[mockLog]} />);

      expect(screen.getByRole("button", { name: "expandDetails" })).toBeInTheDocument();
    });

    it("does not show expand indicator when no details are available", () => {
      const logWithoutDetails: RequestLog = {
        ...mockLog,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        cached_tokens: 0,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
        reasoning_tokens: 0,
        routing_decision: null,
        failover_attempts: 0,
        failover_history: null,
      };

      render(<LogsTable logs={[logWithoutDetails]} />);

      expect(screen.queryByRole("button", { name: "expandDetails" })).not.toBeInTheDocument();
    });

    it("shows expand indicator when failover attempts > 0", () => {
      render(<LogsTable logs={[logWithFailoverBase]} />);

      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      expect(expandButton).toBeInTheDocument();
    });

    it("expands row on click to show token details", () => {
      render(<LogsTable logs={[logWithFailoverBase]} />);

      // Click expand button
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      // Token details should be visible
      expect(screen.getByText("tokenDetails")).toBeInTheDocument();
      expect(screen.getByText("tokenInput")).toBeInTheDocument();
      expect(screen.getByText("tokenOutput")).toBeInTheDocument();
      expect(screen.getByText("tokenTotal")).toBeInTheDocument();
    });

    it("shows routing decision timeline in expanded view when available", () => {
      const logWithRouting: RequestLog = {
        ...logWithFailoverBase,
        routing_decision: mockRoutingDecision,
      };

      render(<LogsTable logs={[logWithRouting]} />);

      // Click expand button
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      // Both token details and timeline stages should be visible
      expect(screen.getByText("tokenDetails")).toBeInTheDocument();
      expect(screen.getByText("timelineModelResolution")).toBeInTheDocument();
    });

    it("shows session affinity stage when routing decision is null", () => {
      render(<LogsTable logs={[logWithFailoverBase]} />);

      // Click expand button
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      // Timeline still renders session affinity and execution stages even without routing decision
      expect(screen.getByText("timelineSessionAffinity")).toBeInTheDocument();
      expect(screen.getByText("timelineExecutionRetries")).toBeInTheDocument();
    });

    it("collapses row on second click", () => {
      render(<LogsTable logs={[logWithFailoverBase]} />);

      // Click to expand
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);
      expect(screen.getByText("tokenDetails")).toBeInTheDocument();

      // Click to collapse (button now has collapseDetails label)
      const collapseButton = screen.getByRole("button", { name: "collapseDetails" });
      fireEvent.click(collapseButton);
      expect(screen.queryByText("tokenDetails")).not.toBeInTheDocument();
    });

    it("shows failover history in timeline retry format", () => {
      render(<LogsTable logs={[logWithFailoverBase]} />);

      // Click expand button
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      // Retry timeline should show attempt with upstream name and error message
      expect(screen.getAllByText(/retryAttempt/).length).toBeGreaterThan(0);
      expect(screen.getByText(/failed-upstream/)).toBeInTheDocument();
      expect(screen.getByText(/Request timed out/)).toBeInTheDocument();
      expect(screen.getByText(/retryTotalDuration/)).toBeInTheDocument();
    });

    it("displays three-column layout with decision, performance, and token details", () => {
      const logWithRouting: RequestLog = {
        ...logWithFailoverBase,
        routing_decision: mockRoutingDecision,
      };

      const { container } = render(<LogsTable logs={[logWithRouting]} />);

      // Click expand button
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      expect(screen.getByText("timelineModelResolution")).toBeInTheDocument();
      expect(screen.getByText("performanceStats")).toBeInTheDocument();
      expect(screen.getByText("tokenDetails")).toBeInTheDocument();

      const gridContainer = container.querySelector("[class*='xl:grid-cols-']");
      expect(gridContainer).toBeInTheDocument();
    });

    it("shows error details in terminal style for error rows", () => {
      render(<LogsTable logs={[{ ...logWithFailoverBase, status_code: 500 }]} />);

      // Click expand button
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      // Should show terminal-style error details
      expect(screen.getByText(/ERROR_TYPE:/)).toBeInTheDocument();
      expect(screen.getByText(/STATUS:/)).toBeInTheDocument();
    });
  });
});
