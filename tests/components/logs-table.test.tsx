import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DEFAULT_LOGS_SERVER_FILTERS, LogsTable } from "@/components/admin/logs-table";
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

// Mock the log recording section so we can assert on its mount without firing real queries.
vi.mock("@/components/admin/log-recording-section", () => ({
  LogRecordingSection: ({ logId, enabled }: { logId: string; enabled: boolean }) => (
    <div data-testid="log-recording-section" data-log-id={logId} data-enabled={String(enabled)} />
  ),
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
    api_key_name: "Primary Key",
    api_key_prefix: "sk-primary",
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
    thinking_config: null,
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
      expect(screen.getByText("tableKey")).toBeInTheDocument();
      expect(screen.getByText("tableMethod")).toBeInTheDocument();
      expect(screen.getByText("tableInterfaceType")).toBeInTheDocument();
      expect(screen.getByText("tableModel")).toBeInTheDocument();
      expect(screen.getByText("tableTokens")).toBeInTheDocument();
      expect(screen.getByText("tableCost")).toBeInTheDocument();
      expect(screen.getByText("tableStatus")).toBeInTheDocument();
      expect(screen.getByText("tableDuration")).toBeInTheDocument();
    });

    it("keeps the interface type header on one line and renders expanded desktop details outside cells", () => {
      render(
        <LogsTable
          logs={[
            {
              ...mockLog,
              routing_decision: {
                original_model: "gpt-4",
                resolved_model: "gpt-4",
                model_redirect_applied: false,
                provider_type: "openai",
                routing_type: "direct",
                candidates: [],
                excluded: [],
                candidate_count: 1,
                final_candidate_count: 1,
                selected_upstream_id: "upstream-1",
                selected_upstream_name: "upstream-1",
                selected_upstream_provider_type: "openai",
                selection_reason: "direct_match",
                selection_strategy: "direct",
                attempted_upstream_ids: ["upstream-1"],
              } as RoutingDecisionLog,
            },
          ]}
        />
      );

      const interfaceTypeHeader = screen.getByText("tableInterfaceType").closest("th");
      expect(interfaceTypeHeader).not.toBeNull();
      expect(interfaceTypeHeader?.className).toContain("whitespace-nowrap");
      expect(interfaceTypeHeader?.className).toContain("w-[84px]");

      const modelHeader = screen.getByText("tableModel").closest("th");
      expect(modelHeader).toHaveStyle({ width: "264px" });

      const tokenHeader = screen.getByText("tableTokens").closest("th");
      expect(tokenHeader?.className).toContain("w-[104px]");

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      const tokenDetails = screen.getByText("tokenDetails");
      expect(tokenDetails.closest("td")).toBeNull();
    });

    it("shrinks the desktop model column when the table container becomes narrow", async () => {
      const originalMatchMedia = window.matchMedia;
      const originalClientWidth = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        "clientWidth"
      );

      window.matchMedia = ((query: string) => ({
        matches:
          query === "(min-width: 768px)" ||
          query === "(min-width: 1024px)" ||
          query === "(min-width: 1280px)",
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;

      Object.defineProperty(HTMLElement.prototype, "clientWidth", {
        configurable: true,
        get() {
          return 1040;
        },
      });

      try {
        render(<LogsTable logs={[mockLog]} />);

        await waitFor(() => {
          const modelHeader = screen.getByText("tableModel").closest("th");
          expect(modelHeader).toHaveStyle({ width: "136px" });
        });
      } finally {
        window.matchMedia = originalMatchMedia;
        if (originalClientWidth) {
          Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
        } else {
          delete (HTMLElement.prototype as Partial<HTMLElement>).clientWidth;
        }
      }
    });

    it("remeasures the desktop model column after switching from empty filter state back to table rows", async () => {
      const originalMatchMedia = window.matchMedia;
      const originalClientWidth = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        "clientWidth"
      );
      window.matchMedia = ((query: string) => ({
        matches:
          query === "(min-width: 768px)" ||
          query === "(min-width: 1024px)" ||
          query === "(min-width: 1280px)",
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;

      Object.defineProperty(HTMLElement.prototype, "clientWidth", {
        configurable: true,
        get() {
          return 1040;
        },
      });

      try {
        // An active server filter with an empty page shows the filtered empty
        // state (the filter bar stays mounted so the filter can be cleared).
        const activeFilters = { statusClass: "5xx" as const, model: "", timeRange: "30d" as const };
        const { rerender } = render(<LogsTable logs={[]} serverFilters={activeFilters} />);

        expect(screen.getByText("noMatchingLogs")).toBeInTheDocument();

        rerender(<LogsTable logs={[mockLog]} serverFilters={activeFilters} />);

        await waitFor(() => {
          const modelHeader = screen.getByText("tableModel").closest("th");
          expect(modelHeader).toHaveStyle({ width: "136px" });
        });
      } finally {
        window.matchMedia = originalMatchMedia;
        if (originalClientWidth) {
          Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
        } else {
          delete (HTMLElement.prototype as Partial<HTMLElement>).clientWidth;
        }
      }
    });

    it("renders log data correctly", () => {
      render(<LogsTable logs={[mockLog]} />);

      expect(screen.getByText("POST")).toBeInTheDocument();
      expect(screen.getByLabelText("requestModeNonStreaming")).toBeInTheDocument();
      expect(
        screen.getByLabelText("capabilityOpenAIChatCompatible: POST /v1/chat/completions")
      ).toBeInTheDocument();
      expect(screen.getByText("gpt-4")).toBeInTheDocument();
    });

    it("deduplicates the inline thinking badge when it mirrors reasoning effort", () => {
      const logWithThinkingBadges = {
        ...mockLog,
        reasoning_effort: "high",
        thinking_config: {
          provider: "openai",
          protocol: "openai_chat",
          mode: "reasoning",
          level: "high",
          budget_tokens: null,
          include_thoughts: null,
          source_paths: ["reasoning_effort"],
        },
      } as RequestLog;

      render(<LogsTable logs={[logWithThinkingBadges]} />);

      const modelCell = screen.getByText("gpt-4").closest("td");
      expect(modelCell).not.toBeNull();
      expect(within(modelCell as HTMLElement).getByText("High")).toBeInTheDocument();
      expect(within(modelCell as HTMLElement).queryByText("[high]")).not.toBeInTheDocument();
      expect(screen.getAllByText("tableModel")).toHaveLength(1);
    });

    it("keeps the inline thinking badge when there is no reasoning effort badge", () => {
      const logWithThinkingOnly = {
        ...mockLog,
        thinking_config: {
          provider: "openai",
          protocol: "openai_chat",
          mode: "reasoning",
          level: "high",
          budget_tokens: null,
          include_thoughts: null,
          source_paths: ["reasoning_effort"],
        },
      } as RequestLog;

      render(<LogsTable logs={[logWithThinkingOnly]} />);

      expect(screen.getByText("[high]")).toBeInTheDocument();
    });

    it("renders budget thinking config as a budget badge instead of bracketed text", () => {
      const logWithBudgetThinking = {
        ...mockLog,
        thinking_config: {
          provider: "google",
          protocol: "gemini_generate",
          mode: "thinking",
          level: null,
          budget_tokens: 512,
          include_thoughts: null,
          source_paths: ["generationConfig.thinkingConfig.thinkingBudget"],
        },
      } as RequestLog;

      render(<LogsTable logs={[logWithBudgetThinking]} />);

      const modelCell = screen.getByText("gpt-4").closest("td");
      expect(modelCell).not.toBeNull();
      expect(within(modelCell as HTMLElement).getByText("Budget")).toBeInTheDocument();
      expect(within(modelCell as HTMLElement).getByText("512")).toBeInTheDocument();
      expect(within(modelCell as HTMLElement).queryByText("[budget:512]")).not.toBeInTheDocument();
    });

    it("applies entry motion class to desktop rows on first render", () => {
      render(<LogsTable logs={[mockLog]} />);

      const row = screen.getAllByRole("row")[1];
      expect(row.className).toContain("animate-log-row-enter");
    });

    it("does not replay desktop row entry animation after expanding details", () => {
      render(
        <LogsTable
          logs={[
            {
              ...mockLog,
              routing_decision: {
                original_model: "gpt-4",
                resolved_model: "gpt-4",
                model_redirect_applied: false,
                provider_type: "openai",
                routing_type: "direct",
                candidates: [],
                excluded: [],
                candidate_count: 1,
                final_candidate_count: 1,
                selected_upstream_id: "upstream-1",
                selected_upstream_name: "upstream-1",
                selected_upstream_provider_type: "openai",
                selection_reason: "direct_match",
                selection_strategy: "direct",
                attempted_upstream_ids: ["upstream-1"],
              } as RoutingDecisionLog,
            },
          ]}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      const dataRow = screen.getAllByRole("row").find((row) => row.querySelector("td"));
      expect(dataRow).toBeDefined();
      expect(dataRow?.className).not.toContain("animate-log-row-enter");
    });

    it("renders streaming mode indicator for stream requests", () => {
      render(<LogsTable logs={[{ ...mockLog, id: "test-id-stream", is_stream: true }]} />);

      expect(screen.getByLabelText("requestModeStreaming")).toBeInTheDocument();
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

  describe("Recording Section Visibility", () => {
    it("mounts the recording section in the expanded row by default", () => {
      render(<LogsTable logs={[mockLog]} />);

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      expect(screen.getByTestId("log-recording-section")).toBeInTheDocument();
    });

    it("omits the recording section when hideRecordingSection is set", () => {
      render(<LogsTable logs={[mockLog]} hideRecordingSection />);

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      expect(screen.queryByTestId("log-recording-section")).not.toBeInTheDocument();
    });
  });

  describe("Mobile Layout Billing Display", () => {
    it("keeps interface type text and request mode visible in mobile cards", () => {
      const originalMatchMedia = window.matchMedia;

      window.matchMedia = ((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;

      try {
        render(<LogsTable logs={[mockLog]} />);

        expect(screen.getByText("capabilityOpenAIChatCompatible")).toBeInTheDocument();
        expect(screen.getByLabelText("requestModeNonStreaming")).toBeInTheDocument();
        expect(
          screen.getByLabelText("capabilityOpenAIChatCompatible: POST /v1/chat/completions")
        ).toBeInTheDocument();
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });

    it("does not render billed status label in mobile cards", async () => {
      const originalMatchMedia = window.matchMedia;

      window.matchMedia = ((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;

      try {
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

        // In mobile layout, we only show cost and unbillable/pending info. Billed label should be hidden.
        await waitFor(() => {
          expect(screen.getByText(/\$1\.234/)).toBeInTheDocument();
        });
        expect(screen.queryByText("billingStatusBilled")).not.toBeInTheDocument();
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });

    it("shows concurrency-full signal in mobile cards when routing excludes candidates for concurrency", () => {
      const originalMatchMedia = window.matchMedia;

      window.matchMedia = ((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;

      try {
        const routingDecision: RoutingDecisionLog = {
          original_model: "gpt-4",
          resolved_model: "gpt-4",
          model_redirect_applied: false,
          routing_type: "group",
          selection_strategy: "weighted_random",
          candidate_count: 3,
          final_candidate_count: 2,
          selected_upstream_id: "upstream-1",
          candidates: [],
          excluded: [{ id: "upstream-3", name: "openai-3", reason: "concurrency_full" }],
        };

        render(<LogsTable logs={[{ ...mockLog, routing_decision: routingDecision }]} />);

        expect(screen.getAllByText("exclusionReason.concurrency_full").length).toBeGreaterThan(0);
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });

    it("renders thinking level in mobile model summary as a badge", () => {
      const originalMatchMedia = window.matchMedia;

      window.matchMedia = ((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;

      try {
        render(
          <LogsTable
            logs={[
              {
                ...mockLog,
                thinking_config: {
                  provider: "openai",
                  protocol: "openai_chat",
                  mode: "reasoning",
                  level: "xhigh",
                  budget_tokens: null,
                  include_thoughts: null,
                  source_paths: ["reasoning_effort"],
                },
              },
            ]}
          />
        );

        const thinkingBadge = screen.getByText("[xhigh]");
        expect(thinkingBadge.closest("div")?.className).toContain("font-mono");
        expect(thinkingBadge.closest("div")?.className).toContain("border-divider");
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });

    it("does not show dash together with unbillable usage-missing reason in mobile cards", async () => {
      const originalMatchMedia = window.matchMedia;

      window.matchMedia = ((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;

      try {
        render(
          <LogsTable
            logs={[
              {
                ...mockLog,
                billing_status: "unbilled",
                unbillable_reason: "usage_missing",
                final_cost: null,
              },
            ]}
          />
        );

        await waitFor(() => {
          expect(screen.getByText("billingReasonUsageMissing")).toBeInTheDocument();
        });
        const reason = screen.getByText("billingReasonUsageMissing");
        const billingContainer = reason.parentElement;
        expect(billingContainer).not.toBeNull();
        expect(billingContainer).not.toHaveTextContent(/^-$/);
        expect(billingContainer).not.toHaveTextContent(/^-billingReasonUsageMissing$/);
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });
  });

  describe("Billing Display", () => {
    it("does not show dash together with unbillable usage-missing reason in table rows", () => {
      render(
        <LogsTable
          logs={[
            {
              ...mockLog,
              billing_status: "unbilled",
              unbillable_reason: "usage_missing",
              final_cost: null,
            },
          ]}
        />
      );

      const reason = screen.getByText("billingReasonUsageMissing");
      const billingContainer = reason.parentElement;

      expect(reason).toBeInTheDocument();
      expect(billingContainer).not.toBeNull();
      expect(billingContainer).not.toHaveTextContent(/^-$/);
      expect(billingContainer).not.toHaveTextContent(/^-billingReasonUsageMissing$/);
    });
  });

  describe("Upstream Display", () => {
    it("shows upstreamUnknown when upstream_id exists but upstream_name is null", () => {
      render(<LogsTable logs={[{ ...mockLog, upstream_name: null }]} />);

      expect(screen.getByText("upstreamUnknown")).toBeInTheDocument();
    });

    it("shows dash when upstream_id is null", () => {
      render(<LogsTable logs={[{ ...mockLog, upstream_id: null, upstream_name: null }]} />);

      const dataRow = screen
        .getAllByRole("row")
        .find((row) => row.querySelector("td") && within(row).queryByText("POST"));

      expect(dataRow).toBeDefined();
      const headerRow = screen
        .getAllByRole("row")
        .find((row) => within(row).queryByText("tableUpstream"));
      expect(headerRow).toBeDefined();

      const headerCells = within(headerRow as HTMLElement).getAllByRole("columnheader");
      const upstreamColumnIndex = headerCells.findIndex((cell) =>
        within(cell).queryByText("tableUpstream")
      );
      expect(upstreamColumnIndex).toBeGreaterThanOrEqual(0);

      const cells = within(dataRow as HTMLElement).getAllByRole("cell");
      const upstreamCell = cells[upstreamColumnIndex];

      expect(upstreamCell).toBeDefined();
      expect(upstreamCell).toHaveTextContent("-");
    });
  });

  describe("Status Indicators", () => {
    const hasClassInAnyTextMatch = (matcher: RegExp, className: string) =>
      screen.getAllByText(matcher).some((el) => {
        let current: Element | null = el;
        while (current) {
          if (current.className?.toString().includes(className)) {
            return true;
          }
          current = current.parentElement;
        }
        return false;
      });

    it("renders 2xx status code with success color in lifecycle track", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 200 }]} />);

      expect(hasClassInAnyTextMatch(/200/, "text-status-success")).toBe(true);
    });

    it("renders 4xx status code in lifecycle track", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 400 }]} />);

      expect(screen.getAllByText(/400/).length).toBeGreaterThan(0);
    });

    it("renders 5xx status code with error color in lifecycle track", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 500 }]} />);

      expect(hasClassInAnyTextMatch(/500/, "text-status-error")).toBe(true);
    });

    it("renders complete label without status code for null status", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: null }]} />);

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));
      expect(screen.getByRole("button", { name: "lifecycleComplete" })).toBeInTheDocument();
    });

    it("renders status code in monospace font via lifecycle track", () => {
      render(<LogsTable logs={[{ ...mockLog, status_code: 500 }]} />);

      const monospaceStatus = screen.getAllByText("500").find((el) => !!el.closest(".font-mono"));
      expect(monospaceStatus).toBeDefined();
    });

    it("renders only status code for 499 client disconnect logs", () => {
      render(
        <LogsTable
          logs={[
            {
              ...mockLog,
              id: "cancelled-log",
              status_code: 499,
            },
          ]}
        />
      );

      expect(screen.getAllByText("499").length).toBeGreaterThan(0);
      expect(screen.queryByText("displayStatusCancelled")).not.toBeInTheDocument();
      expect(screen.queryByText("displayStatusInterrupted")).not.toBeInTheDocument();
    });

    it("renders spinner without dash for in-progress logs", () => {
      render(
        <LogsTable
          logs={[
            {
              ...mockLog,
              id: "in-progress-log",
              status_code: null,
              duration_ms: null,
            },
          ]}
          isLive
        />
      );

      expect(screen.getByLabelText("displayStatusInProgress")).not.toHaveTextContent("-");
      expect(screen.queryByText("displayStatusInProgress")).not.toBeInTheDocument();
    });
  });

  describe("Token Formatting", () => {
    it("renders total tokens with breakdown", () => {
      render(<LogsTable logs={[mockLog]} />);

      expect(screen.getByText("300")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));
      expect(screen.getByText("tokenInput")).toBeInTheDocument();
      expect(screen.getByText("tokenOutput")).toBeInTheDocument();
    });

    it("renders display total including cache summary", () => {
      render(
        <LogsTable
          logs={[
            {
              ...mockLog,
              prompt_tokens: 4,
              completion_tokens: 1076,
              total_tokens: 1080,
              cached_tokens: 2348,
              cache_creation_tokens: 11528,
              cache_read_tokens: 2348,
            },
          ]}
        />
      );

      expect(screen.getByText(/14[,.\s\u00a0\u202f]?956/)).toBeInTheDocument();
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

    it("renders absolute timestamp once the log is older than one minute", () => {
      const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const expectedTimestamp = new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(createdAt));

      render(<LogsTable logs={[{ ...mockLog, created_at: createdAt }]} />);

      return waitFor(() => {
        expect(document.body).toHaveTextContent(expectedTimestamp);
        expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
      });
    });

    it("renders less than one minute copy for fresh logs", () => {
      render(<LogsTable logs={[{ ...mockLog, created_at: new Date().toISOString() }]} />);

      return waitFor(() => {
        expect(screen.getByText("logTimeLessThanMinute")).toBeInTheDocument();
        expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
      });
    });
  });

  describe("Lifecycle Track Timing Display", () => {
    it("renders stage timing in milliseconds when under 1 second", () => {
      render(
        <LogsTable
          logs={[
            {
              ...mockLog,
              stage_timings_ms: {
                total_ms: 600,
                decision_ms: 50,
                upstream_response_ms: 500,
                first_token_ms: null,
                generation_ms: null,
                gateway_processing_ms: null,
              },
            },
          ]}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));
      expect(screen.getAllByText(/600ms \(\+500ms\)/).length).toBeGreaterThan(0);
    });

    it("renders stage timing in seconds when over 1 second", () => {
      render(
        <LogsTable
          logs={[
            {
              ...mockLog,
              stage_timings_ms: {
                total_ms: 1600,
                decision_ms: 100,
                upstream_response_ms: 1500,
                first_token_ms: null,
                generation_ms: null,
                gateway_processing_ms: null,
              },
            },
          ]}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));
      expect(screen.getAllByText(/1\.6s \(\+1\.5s\)/).length).toBeGreaterThan(0);
    });

    it("renders stage labels without timing values when no stage_timings_ms provided", () => {
      render(<LogsTable logs={[{ ...mockLog, duration_ms: null }]} />);

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));
      expect(screen.getByRole("button", { name: "lifecycleDecision" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "lifecycleComplete" })).toBeInTheDocument();
    });
  });

  describe("TTFT Formatting", () => {
    it("renders TTFT in lifecycle track response segment for streaming requests", () => {
      render(
        <LogsTable
          logs={[
            {
              ...mockLog,
              is_stream: true,
              stage_timings_ms: {
                total_ms: 1500,
                decision_ms: 100,
                upstream_response_ms: 1300,
                first_token_ms: 650,
                generation_ms: 650,
                gateway_processing_ms: null,
              },
            },
          ]}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      // Expanded timing details contain TTFT and generation timing.
      expect(screen.getAllByText(/650ms/).length).toBeGreaterThan(0);
    });

    it("renders TTFT over 1 second in compact seconds format", () => {
      render(
        <LogsTable
          logs={[
            {
              ...mockLog,
              is_stream: true,
              stage_timings_ms: {
                total_ms: 2500,
                decision_ms: 100,
                upstream_response_ms: 2300,
                first_token_ms: 1222,
                generation_ms: 1078,
                gateway_processing_ms: null,
              },
            },
          ]}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      // fmtMs(1222) → "1.2s"
      expect(screen.getAllByText(/1\.2s/).length).toBeGreaterThan(0);
    });

    it("shows streaming TTFT sub-timing in response segment", () => {
      render(
        <LogsTable
          logs={[
            {
              ...mockLog,
              is_stream: true,
              stage_timings_ms: {
                total_ms: 1000,
                decision_ms: 50,
                upstream_response_ms: 900,
                first_token_ms: 220,
                generation_ms: 680,
                gateway_processing_ms: null,
              },
            },
          ]}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      // Expanded timing details contain TTFT sub-timing.
      expect(screen.getAllByText(/220ms/).length).toBeGreaterThan(0);
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
      fireEvent.click(screen.getAllByRole("button", { name: "lifecycleResponse" })[0]);
      expect(screen.getByText("journeyGenerationFinished")).toBeInTheDocument();
      expect(screen.getAllByText(/450ms/).length).toBeGreaterThan(0);
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

      await act(async () => {
        rerender(<LogsTable logs={[newLog, mockLog]} />);
      });

      const row = screen.getAllByRole("row")[1];
      const summaryTile = screen.getByText("summaryP50Ttft").closest("div");

      await waitFor(() => {
        expect(row.className).toContain("bg-status-info-muted/25");
        expect(row.className).toContain("animate-log-row-emphasis");
        expect(summaryTile).toBeInTheDocument();
        expect(summaryTile?.className).toContain("animate-log-live-highlight");
      });
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

    it("adds hover motion to summary tiles and quick filter chips", () => {
      render(<LogsTable logs={[mockLog]} onServerFiltersChange={vi.fn()} />);

      const summaryTile = screen.getByText("summaryP50Ttft").closest("div");
      const quickFilter = screen.getByRole("button", { name: "presetHighTtft" });

      expect(summaryTile).toBeInTheDocument();
      expect(summaryTile?.className).toContain("motion-safe:hover:-translate-y-0.5");
      expect(quickFilter.className).toContain("motion-safe:hover:-translate-y-0.5");
    });

    it("emits a perfPreset patch when a quick filter chip is clicked", () => {
      const onServerFiltersChange = vi.fn();
      render(<LogsTable logs={[mockLog]} onServerFiltersChange={onServerFiltersChange} />);

      fireEvent.click(screen.getByRole("button", { name: "presetHighTtft" }));
      expect(onServerFiltersChange).toHaveBeenLastCalledWith({ perfPreset: "high_ttft" });

      fireEvent.click(screen.getByRole("button", { name: "presetLowTps" }));
      expect(onServerFiltersChange).toHaveBeenLastCalledWith({ perfPreset: "low_tps" });

      fireEvent.click(screen.getByRole("button", { name: "presetSlowDuration" }));
      expect(onServerFiltersChange).toHaveBeenLastCalledWith({ perfPreset: "slow_duration" });

      fireEvent.click(screen.getByRole("button", { name: "presetAll" }));
      expect(onServerFiltersChange).toHaveBeenLastCalledWith({ perfPreset: "all" });
    });

    it("renders every row regardless of the active preset (narrowing is server-side)", () => {
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

      render(
        <LogsTable
          logs={[slowLog, fastLog]}
          serverFilters={{ ...DEFAULT_LOGS_SERVER_FILTERS, perfPreset: "slow_duration" }}
          onServerFiltersChange={vi.fn()}
        />
      );

      // The server already applied the preset; the page is rendered as-is.
      expect(screen.getByText("/v1/slow-duration")).toBeInTheDocument();
      expect(screen.getByText("/v1/fast-duration")).toBeInTheDocument();
    });

    it("highlights the active preset chip from serverFilters", () => {
      render(
        <LogsTable
          logs={[mockLog]}
          serverFilters={{ ...DEFAULT_LOGS_SERVER_FILTERS, perfPreset: "high_ttft" }}
          onServerFiltersChange={vi.fn()}
        />
      );

      expect(screen.getByRole("button", { name: "presetHighTtft" }).className).toContain(
        "border-amber-500/45"
      );
      expect(screen.getByRole("button", { name: "presetAll" }).className).not.toContain(
        "border-amber-500/45"
      );
    });

    it("hides the quick filter chips when onServerFiltersChange is omitted", () => {
      // Focus view: without a change callback the chips would be silent no-ops.
      render(<LogsTable logs={[mockLog]} />);

      expect(screen.queryByRole("button", { name: "presetAll" })).not.toBeInTheDocument();
      expect(screen.queryByText("quickFiltersServerScope")).not.toBeInTheDocument();
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

    it("does not render a thinking badge when thinking config is null", () => {
      render(<LogsTable logs={[{ ...mockLog, thinking_config: null }]} />);

      expect(screen.queryByText("[high]")).not.toBeInTheDocument();
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
      it("renders every provided log row (status filtering happens server-side)", () => {
        render(<LogsTable logs={logsForFiltering} />);

        const rows = screen.getAllByRole("row");
        // 1 header + 7 data rows: the table no longer narrows the page itself.
        expect(rows.length).toBe(8);
      });

      it("hides the server filter controls when onServerFiltersChange is omitted", () => {
        // The focus view pins a single entry: without a change callback the
        // status/model/time controls and quick filter chips would be silent
        // no-ops, so they are all hidden.
        render(<LogsTable logs={logsForFiltering} />);

        expect(screen.queryByPlaceholderText("filterModel")).not.toBeInTheDocument();
        expect(screen.queryByText("timeRange.7d")).not.toBeInTheDocument();
        expect(screen.queryByText("presetAll")).not.toBeInTheDocument();
      });
    });

    describe("Model Filter", () => {
      it("debounces model input changes up to onServerFiltersChange as a model-only patch", async () => {
        const onServerFiltersChange = vi.fn();
        render(<LogsTable logs={logsForFiltering} onServerFiltersChange={onServerFiltersChange} />);

        const input = screen.getByPlaceholderText("filterModel");
        fireEvent.change(input, { target: { value: "  Claude " } });

        // Debounced: not called synchronously.
        expect(onServerFiltersChange).not.toHaveBeenCalled();

        // The patch must contain ONLY the model: merging in the parent's
        // functional setState is what prevents a stale-snapshot clobber of a
        // concurrent status/time change.
        await waitFor(() =>
          expect(onServerFiltersChange).toHaveBeenCalledWith({ model: "Claude" })
        );
      });

      it("does not commit a model patch when the trimmed value is unchanged", async () => {
        const onServerFiltersChange = vi.fn();
        render(
          <LogsTable
            logs={logsForFiltering}
            serverFilters={{ ...DEFAULT_LOGS_SERVER_FILTERS, model: "claude" }}
            onServerFiltersChange={onServerFiltersChange}
          />
        );

        const input = screen.getByPlaceholderText("filterModel");
        // Same effective value with extra whitespace must not reset pagination.
        fireEvent.change(input, { target: { value: " claude " } });

        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(onServerFiltersChange).not.toHaveBeenCalled();
      });

      it("resyncs the model echo when the controlled value changes from outside", () => {
        const { rerender } = render(
          <LogsTable
            logs={logsForFiltering}
            serverFilters={{ ...DEFAULT_LOGS_SERVER_FILTERS, model: "claude" }}
            onServerFiltersChange={vi.fn()}
          />
        );

        expect(screen.getByPlaceholderText("filterModel")).toHaveValue("claude");

        rerender(
          <LogsTable
            logs={logsForFiltering}
            serverFilters={{ ...DEFAULT_LOGS_SERVER_FILTERS, model: "" }}
            onServerFiltersChange={vi.fn()}
          />
        );

        expect(screen.getByPlaceholderText("filterModel")).toHaveValue("");
      });
    });

    describe("Time Range Filter", () => {
      it("renders logs of any age (time filtering happens server-side)", () => {
        render(<LogsTable logs={logsForFiltering} />);

        // The 35-day-old rows stay visible: the server decides the window.
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(8); // 1 header + 7 data rows
      });

      it("notifies onServerFiltersChange when a time range preset is clicked", () => {
        const onServerFiltersChange = vi.fn();
        render(<LogsTable logs={logsForFiltering} onServerFiltersChange={onServerFiltersChange} />);

        fireEvent.click(screen.getByText("timeRange.7d"));

        // customRange is reset alongside: a stale custom window must not
        // survive a preset click.
        expect(onServerFiltersChange).toHaveBeenCalledWith({ timeRange: "7d", customRange: null });
      });

      it("offers an all-time preset so entries older than 30d stay reachable", () => {
        const onServerFiltersChange = vi.fn();
        render(<LogsTable logs={logsForFiltering} onServerFiltersChange={onServerFiltersChange} />);

        fireEvent.click(screen.getByText("timeRange.all"));

        expect(onServerFiltersChange).toHaveBeenCalledWith({ timeRange: "all", customRange: null });
      });
    });

    describe("Status Code Input", () => {
      it("debounces digit-only status code patches and skips no-ops", async () => {
        const onServerFiltersChange = vi.fn();
        render(<LogsTable logs={logsForFiltering} onServerFiltersChange={onServerFiltersChange} />);

        const input = screen.getByPlaceholderText("filterStatusCode");
        fireEvent.change(input, { target: { value: "4a04" } });

        // Non-digits stripped in the local echo; not committed synchronously.
        expect(input).toHaveValue("404");
        expect(onServerFiltersChange).not.toHaveBeenCalled();

        await waitFor(() =>
          expect(onServerFiltersChange).toHaveBeenCalledWith({ statusCode: "404" })
        );
      });

      it("does not commit a status code patch when the value is unchanged", async () => {
        const onServerFiltersChange = vi.fn();
        render(
          <LogsTable
            logs={logsForFiltering}
            serverFilters={{ ...DEFAULT_LOGS_SERVER_FILTERS, statusCode: "404" }}
            onServerFiltersChange={onServerFiltersChange}
          />
        );

        const input = screen.getByPlaceholderText("filterStatusCode");
        fireEvent.change(input, { target: { value: "404x" } });

        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(onServerFiltersChange).not.toHaveBeenCalled();
      });
    });

    describe("Upstream / API Key Selects", () => {
      it("renders the selects only when option props are provided (portal omits them)", () => {
        const { rerender } = render(
          <LogsTable logs={logsForFiltering} onServerFiltersChange={vi.fn()} />
        );

        // Portal / no-options case: the admin-only selects must not render.
        expect(screen.queryByLabelText("filterUpstream")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("filterApiKey")).not.toBeInTheDocument();

        rerender(
          <LogsTable
            logs={logsForFiltering}
            onServerFiltersChange={vi.fn()}
            upstreamFilterOptions={[{ id: "up-1", name: "Upstream One" }]}
            apiKeyFilterOptions={[{ id: "key-1", name: "Key One" }]}
          />
        );

        expect(screen.getByLabelText("filterUpstream")).toBeInTheDocument();
        expect(screen.getByLabelText("filterApiKey")).toBeInTheDocument();
      });
    });

    describe("Column Sorting", () => {
      function durationSortButton() {
        return screen.getByText("tableDuration").closest("button")!;
      }

      it("cycles desc → asc → cleared on repeated header clicks", () => {
        const onServerFiltersChange = vi.fn();
        const { rerender } = render(
          <LogsTable logs={logsForFiltering} onServerFiltersChange={onServerFiltersChange} />
        );

        fireEvent.click(durationSortButton());
        expect(onServerFiltersChange).toHaveBeenLastCalledWith({
          sortField: "duration_ms",
          sortOrder: "desc",
        });

        rerender(
          <LogsTable
            logs={logsForFiltering}
            serverFilters={{ ...DEFAULT_LOGS_SERVER_FILTERS, sortField: "duration_ms" }}
            onServerFiltersChange={onServerFiltersChange}
          />
        );
        fireEvent.click(durationSortButton());
        expect(onServerFiltersChange).toHaveBeenLastCalledWith({ sortOrder: "asc" });

        rerender(
          <LogsTable
            logs={logsForFiltering}
            serverFilters={{
              ...DEFAULT_LOGS_SERVER_FILTERS,
              sortField: "duration_ms",
              sortOrder: "asc",
            }}
            onServerFiltersChange={onServerFiltersChange}
          />
        );
        fireEvent.click(durationSortButton());
        expect(onServerFiltersChange).toHaveBeenLastCalledWith({
          sortField: null,
          sortOrder: "desc",
        });
      });

      it("exposes the active sort via aria-sort on the header cell", () => {
        render(
          <LogsTable
            logs={logsForFiltering}
            serverFilters={{
              ...DEFAULT_LOGS_SERVER_FILTERS,
              sortField: "duration_ms",
              sortOrder: "asc",
            }}
            onServerFiltersChange={vi.fn()}
          />
        );

        expect(screen.getByText("tableDuration").closest("th")).toHaveAttribute(
          "aria-sort",
          "ascending"
        );
        expect(screen.getByText("tableTokens").closest("th")).not.toHaveAttribute("aria-sort");
      });

      it("renders plain header labels without sort buttons in the focus view", () => {
        render(<LogsTable logs={logsForFiltering} />);

        expect(screen.getByText("tableDuration").closest("button")).toBeNull();
        expect(screen.getByText("tableTime").closest("button")).toBeNull();
      });
    });

    describe("Combined Filters", () => {
      it("renders the full page with default filters", () => {
        render(<LogsTable logs={logsForFiltering} />);

        // Server-side filters no longer narrow the fetched page locally.
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(8); // 1 header + 7 data rows
      });
    });

    describe("Empty State After Filtering", () => {
      it("shows the filtered empty state when active server filters return no rows", () => {
        render(
          <LogsTable
            logs={[]}
            serverFilters={{ ...DEFAULT_LOGS_SERVER_FILTERS, model: "gpt-999" }}
            onServerFiltersChange={vi.fn()}
          />
        );

        expect(screen.getByText("noMatchingLogs")).toBeInTheDocument();
        expect(screen.getByText("noMatchingLogsDesc")).toBeInTheDocument();
        // The filter bar must stay mounted so the filter can be cleared.
        expect(screen.getByPlaceholderText("filterModel")).toBeInTheDocument();
      });

      it("points at the ALL preset when only the default 30d window is active", () => {
        // A user whose logs are all older than 30 days is not out of data —
        // the default window is hiding it, and the copy must say so.
        render(<LogsTable logs={[]} onServerFiltersChange={vi.fn()} />);

        expect(screen.getByText("noLogsInRange")).toBeInTheDocument();
        expect(screen.getByText("noLogsInRangeDesc")).toBeInTheDocument();
      });

      it("shows the plain empty state when the ALL range confirms there is no data", () => {
        render(
          <LogsTable
            logs={[]}
            serverFilters={{ ...DEFAULT_LOGS_SERVER_FILTERS, timeRange: "all" }}
            onServerFiltersChange={vi.fn()}
          />
        );

        expect(screen.getByText("noLogs")).toBeInTheDocument();
      });

      it("shows the plain empty state when filters are not interactive", () => {
        render(<LogsTable logs={[]} />);

        expect(screen.getByText("noLogs")).toBeInTheDocument();
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
      final_selection_reason: {
        code: "single_candidate_remaining",
        selected_upstream_id: "upstream-1",
        selected_tier: 0,
        selected_circuit_state: "closed",
        candidate_count: 3,
        final_candidate_count: 2,
        retry_reason: {
          previous_upstream_id: "upstream-9",
          previous_upstream_name: "failed-upstream",
          previous_error_type: "timeout",
          previous_error_message: "Request timed out",
        },
      },
      candidates: [
        { id: "upstream-1", name: "openai-1", weight: 100, circuit_state: "closed" },
        { id: "upstream-2", name: "openai-2", weight: 50, circuit_state: "half_open" },
      ],
      excluded: [{ id: "upstream-3", name: "openai-3", reason: "concurrency_full" }],
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
          selection_reason: {
            code: "weighted_selection",
            selected_upstream_id: "upstream-1",
            selected_tier: 0,
            selected_circuit_state: "closed",
            candidate_count: 3,
            final_candidate_count: 2,
            retry_reason: null,
          },
        },
      ],
    };

    it("shows compact concurrency-full signal in the desktop routing summary", () => {
      render(
        <LogsTable
          logs={[
            {
              ...mockLog,
              routing_decision: mockRoutingDecision,
            },
          ]}
        />
      );

      expect(screen.getByText("exclusionReason.concurrency_full")).toBeInTheDocument();
    });

    it("shows queue status badges in compact summaries", () => {
      render(
        <LogsTable
          logs={[
            {
              ...mockLog,
              routing_decision: {
                ...mockRoutingDecision,
                queue: {
                  status: "resumed",
                  upstream_id: "upstream-2",
                  entered_at: attemptedAt,
                  resumed_at: attemptedAt,
                  wait_duration_ms: 1200,
                  timeout_ms: 30000,
                },
              },
            },
          ]}
        />
      );

      expect(screen.getAllByText("queueStatus.resumed").length).toBeGreaterThan(0);
    });

    const hasAncestorClass = (element: HTMLElement, className: string) => {
      let current: HTMLElement | null = element;
      while (current) {
        if (current.className?.toString().includes(className)) {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    };

    it("shows expand indicator when token details exist even without failover", () => {
      render(<LogsTable logs={[mockLog]} />);

      expect(screen.getByRole("button", { name: "expandDetails" })).toBeInTheDocument();
    });

    it("does not show expand indicator when no details are available", () => {
      const logWithoutDetails: RequestLog = {
        ...mockLog,
        api_key_name: null,
        api_key_prefix: null,
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

    it("shows expand button when cache summary exists even if raw total is zero", () => {
      const cacheOnlyLog: RequestLog = {
        ...logWithFailoverBase,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        cached_tokens: 30,
        cache_creation_tokens: 20,
        cache_read_tokens: 30,
        failover_attempts: 0,
        failover_history: null,
        routing_decision: null,
        session_id: null,
      };

      render(<LogsTable logs={[cacheOnlyLog]} />);

      expect(screen.getByRole("button", { name: "expandDetails" })).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
    });

    it("shows expand indicator when only thinking config is available", () => {
      const thinkingOnlyLog: RequestLog = {
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
        thinking_config: {
          provider: "openai",
          protocol: "openai_chat",
          mode: "reasoning",
          level: "high",
          budget_tokens: null,
          include_thoughts: null,
          source_paths: ["reasoning_effort"],
        },
      };

      render(<LogsTable logs={[thinkingOnlyLog]} />);

      expect(screen.getByRole("button", { name: "expandDetails" })).toBeInTheDocument();
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

    it("shows a dedicated thinking config panel with request-side fields", () => {
      render(
        <LogsTable
          logs={[
            {
              ...logWithFailoverBase,
              thinking_config: {
                provider: "openai",
                protocol: "openai_chat",
                mode: "reasoning",
                level: "xhigh",
                budget_tokens: null,
                include_thoughts: null,
                source_paths: ["reasoning_effort"],
              },
            },
          ]}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      expect(screen.getByText("thinkingConfig")).toBeInTheDocument();
      expect(screen.queryByText(/thinkingProtocol/)).not.toBeInTheDocument();
      expect(screen.queryByText(/thinkingSourcePaths/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Expand thinking details" }));

      expect(screen.getAllByText(/thinkingProvider/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/thinkingProtocol/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/thinkingLevel/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/thinkingSourcePaths/).length).toBeGreaterThan(0);

      const thinkingPanel = screen.getByText("thinkingConfig").closest("div");
      expect(thinkingPanel).not.toBeNull();
      expect(within(thinkingPanel as HTMLElement).queryByText("[xhigh]")).not.toBeInTheDocument();
    });

    it("shows an explicit empty state for missing thinking config", () => {
      render(<LogsTable logs={[mockLog]} />);

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      expect(screen.getByText("thinkingConfig")).toBeInTheDocument();
      expect(screen.getAllByText("thinkingNotExplicitlySpecified")).toHaveLength(1);

      fireEvent.click(screen.getByRole("button", { name: "Expand thinking details" }));

      expect(screen.getAllByText("thinkingNotExplicitlySpecified")).toHaveLength(2);
    });

    it("applies detail enter animation when expanded content opens", () => {
      const { container } = render(<LogsTable logs={[mockLog]} />);

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      expect(container.querySelector(".animate-log-detail-enter")).toBeInTheDocument();
    });

    it("shows billing breakdown formula under token details when billed", () => {
      const billedLog: RequestLog = {
        ...logWithFailoverBase,
        billing_status: "billed",
        currency: "USD",
        final_cost: 0.0012282,
        billed_input_tokens: 100,
        base_input_price_per_million: 3,
        base_output_price_per_million: 15,
        base_cache_read_input_price_per_million: 0.3,
        base_cache_write_input_price_per_million: 3,
        input_multiplier: 1.2,
        output_multiplier: 1.1,
        cache_read_tokens: 20,
        cache_creation_tokens: 10,
        cache_read_cost: 0.0000072,
        cache_write_cost: 0.000036,
        completion_tokens: 50,
      };

      render(<LogsTable logs={[billedLog]} />);

      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      expect(screen.getByText("tokenDetails")).toBeInTheDocument();
      expect(screen.getByText("billingDetails")).toBeInTheDocument();

      expect(screen.getAllByText(/billingTotal/).length).toBeGreaterThan(0);
      expect(document.body).toHaveTextContent(/100\*\$3\.00\/ 1M\*1\.2=/);
      expect(document.body).toHaveTextContent(/50\*\$15\.00\/ 1M\*1\.1=/);
      expect(document.body).toHaveTextContent(/20\*\$0\.30\/ 1M\*1\.2=/);
      expect(document.body).toHaveTextContent(/10\*\$3\.00\/ 1M\*1\.2=/);
    });

    it("shows matched-rule summary with tier rule when applied_tier_threshold is present", () => {
      const billedLogWithTier: RequestLog = {
        ...logWithFailoverBase,
        billing_status: "billed",
        currency: "USD",
        final_cost: 0.002,
        billed_input_tokens: 150000,
        base_input_price_per_million: 5,
        base_output_price_per_million: 15,
        input_multiplier: 1,
        output_multiplier: 1,
        price_source: "litellm",
        applied_tier_threshold: 128000,
        completion_tokens: 50,
      };

      render(<LogsTable logs={[billedLogWithTier]} />);

      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      expect(screen.getByText("billingDetails")).toBeInTheDocument();
      // Should show tiered rule type
      expect(screen.getByText(/billingRuleType/)).toBeInTheDocument();
      expect(screen.getByText(/billingRuleTier/)).toBeInTheDocument();
      // Should show threshold label and value
      expect(screen.getByText(/billingThreshold/)).toBeInTheDocument();
      // The literal threshold number should be visible (formatted with locale)
      expect(screen.getByText(/128,?000/)).toBeInTheDocument();
      // Should also show price source
      expect(screen.getByText(/billingPriceSource/)).toBeInTheDocument();
      expect(screen.getByText(/billingSourceSynced/)).toBeInTheDocument();
    });

    it("shows matched-rule summary with manual source when price_source is manual", () => {
      const billedLogManual: RequestLog = {
        ...logWithFailoverBase,
        billing_status: "billed",
        currency: "USD",
        final_cost: 0.001,
        billed_input_tokens: 100,
        base_input_price_per_million: 3,
        base_output_price_per_million: 9,
        input_multiplier: 1,
        output_multiplier: 1,
        price_source: "manual",
        applied_tier_threshold: null,
        completion_tokens: 50,
      };

      render(<LogsTable logs={[billedLogManual]} />);

      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      expect(screen.getByText("billingDetails")).toBeInTheDocument();
      // Should show flat rule type (not tiered)
      expect(screen.getByText(/billingRuleType/)).toBeInTheDocument();
      expect(screen.getByText(/billingRuleFlat/)).toBeInTheDocument();
      // Should not show tier rule or threshold
      expect(screen.queryByText(/billingRuleTier/)).not.toBeInTheDocument();
      expect(screen.queryByText(/billingThreshold/)).not.toBeInTheDocument();
      // Should show manual price source
      expect(screen.getByText(/billingPriceSource/)).toBeInTheDocument();
      expect(screen.getByText(/billingSourceManual/)).toBeInTheDocument();
    });

    it("shows flat fallback summary with synced source when no tier threshold matched", () => {
      const billedLogFlatFallback: RequestLog = {
        ...logWithFailoverBase,
        billing_status: "billed",
        currency: "USD",
        final_cost: 0.0015,
        billed_input_tokens: 100,
        base_input_price_per_million: 3,
        base_output_price_per_million: 9,
        input_multiplier: 1,
        output_multiplier: 1,
        price_source: "litellm",
        applied_tier_threshold: null,
        completion_tokens: 50,
      };

      render(<LogsTable logs={[billedLogFlatFallback]} />);

      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      expect(screen.getByText(/billingRuleType/)).toBeInTheDocument();
      expect(screen.getByText(/billingRuleFlat/)).toBeInTheDocument();
      expect(screen.getByText(/billingPriceSource/)).toBeInTheDocument();
      expect(screen.getByText(/billingSourceSynced/)).toBeInTheDocument();
      expect(screen.queryByText(/billingThreshold/)).not.toBeInTheDocument();
    });

    it("preserves unbilled state display without matched-rule summary", () => {
      const unbilledLog: RequestLog = {
        ...logWithFailoverBase,
        billing_status: "unbilled",
        unbillable_reason: "price_not_found",
        final_cost: null,
      };

      render(<LogsTable logs={[unbilledLog]} />);

      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      expect(screen.getByText("billingDetails")).toBeInTheDocument();
      // Unbilled status and reason should be shown in the billing panel
      expect(screen.getByText(/billingStatusUnbilled/)).toBeInTheDocument();
      // Use getAllByText since the reason may appear in multiple places (row + expanded)
      expect(screen.getAllByText(/billingReasonPriceNotFound/).length).toBeGreaterThan(0);
      // Rule type and price source should NOT be shown for unbilled logs
      expect(screen.queryByText(/billingRuleType/)).not.toBeInTheDocument();
      expect(screen.queryByText(/billingRuleTier/)).not.toBeInTheDocument();
      expect(screen.queryByText(/billingRuleFlat/)).not.toBeInTheDocument();
      expect(screen.queryByText(/billingPriceSource/)).not.toBeInTheDocument();
    });

    it("shows matched_rule_type and matched_rule_display_label when available", () => {
      const billedLogWithMatchedRule: RequestLog = {
        ...logWithFailoverBase,
        billing_status: "billed",
        currency: "USD",
        final_cost: 0.002,
        billed_input_tokens: 150000,
        base_input_price_per_million: 5,
        base_output_price_per_million: 15,
        input_multiplier: 1,
        output_multiplier: 1,
        price_source: "litellm",
        matched_rule_type: "tiered",
        matched_rule_display_label: ">128K",
        applied_tier_threshold: 128000,
        completion_tokens: 50,
      };

      render(<LogsTable logs={[billedLogWithMatchedRule]} />);

      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      expect(screen.getByText("billingDetails")).toBeInTheDocument();
      // Should show tiered rule type
      expect(screen.getByText(/billingRuleType/)).toBeInTheDocument();
      expect(screen.getByText(/billingRuleTier/)).toBeInTheDocument();
      // Should show display label from matched_rule_display_label
      expect(screen.getByText(">128K")).toBeInTheDocument();
      // Should show threshold
      expect(screen.getByText(/billingThreshold/)).toBeInTheDocument();
      expect(screen.getByText(/128,?000/)).toBeInTheDocument();
    });

    it("shows model window metadata in token details when available", () => {
      const billedLogWithWindowMetadata: RequestLog = {
        ...logWithFailoverBase,
        billing_status: "billed",
        currency: "USD",
        final_cost: 0.001,
        billed_input_tokens: 100,
        base_input_price_per_million: 3,
        base_output_price_per_million: 9,
        input_multiplier: 1,
        output_multiplier: 1,
        price_source: "litellm",
        matched_rule_type: "flat",
        model_max_input_tokens: 128000,
        model_max_output_tokens: 4096,
        completion_tokens: 50,
      };

      render(<LogsTable logs={[billedLogWithWindowMetadata]} />);

      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      expect(screen.getByText("tokenDetails")).toBeInTheDocument();
      // Should show model window metadata
      expect(screen.getAllByText(/modelWindow/).length).toBeGreaterThan(0);
      expect(screen.getByText(/modelWindowMaxInput/)).toBeInTheDocument();
      expect(screen.getByText(/128,?000/)).toBeInTheDocument();
      expect(screen.getByText(/modelWindowMaxOutput/)).toBeInTheDocument();
      expect(screen.getByText(/4,?096/)).toBeInTheDocument();
    });

    it("shows flat rule type when matched_rule_type is flat", () => {
      const billedLogFlat: RequestLog = {
        ...logWithFailoverBase,
        billing_status: "billed",
        currency: "USD",
        final_cost: 0.001,
        billed_input_tokens: 100,
        base_input_price_per_million: 3,
        base_output_price_per_million: 9,
        input_multiplier: 1,
        output_multiplier: 1,
        price_source: "litellm",
        matched_rule_type: "flat",
        matched_rule_display_label: null,
        applied_tier_threshold: null,
        completion_tokens: 50,
      };

      render(<LogsTable logs={[billedLogFlat]} />);

      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      expect(screen.getByText("billingDetails")).toBeInTheDocument();
      expect(screen.getByText(/billingRuleType/)).toBeInTheDocument();
      expect(screen.getByText(/billingRuleFlat/)).toBeInTheDocument();
      // Should not show tier rule or threshold
      expect(screen.queryByText(/billingRuleTier/)).not.toBeInTheDocument();
      expect(screen.queryByText(/billingThreshold/)).not.toBeInTheDocument();
    });

    it("shows sequential lifecycle flow in expanded view when available", () => {
      const logWithRouting: RequestLog = {
        ...logWithFailoverBase,
        routing_decision: mockRoutingDecision,
        is_stream: true,
        duration_ms: 1650,
        routing_duration_ms: 300,
        ttft_ms: 900,
        completion_tokens: 120,
        stage_timings_ms: {
          total_ms: 1650,
          decision_ms: 300,
          upstream_response_ms: 950,
          first_token_ms: 900,
          generation_ms: 400,
          gateway_processing_ms: null,
        },
      };

      render(<LogsTable logs={[logWithRouting]} />);

      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      expect(screen.getByText("tokenDetails")).toBeInTheDocument();
      expect(screen.getByText("lifecycleTimeline")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "journeyRequestArrived" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "lifecycleDecision" }).length).toBeGreaterThan(
        0
      );
      expect(screen.queryByText("timelineUpstreamSelection")).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "lifecycleRequest" }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("button", { name: "lifecycleResponse" }).length).toBeGreaterThan(
        0
      );
      expect(screen.getAllByRole("button", { name: "lifecycleComplete" }).length).toBeGreaterThan(
        0
      );

      fireEvent.click(screen.getAllByRole("button", { name: "lifecycleDecision" })[0]);
      expect(screen.getByText("journeySelectionBasis")).toBeInTheDocument();
      expect(screen.getByText("journeyDecisionResult")).toBeInTheDocument();

      fireEvent.click(screen.getAllByRole("button", { name: "lifecycleRequest" })[0]);
      expect(screen.getByText(/journeyRequestAction/)).toBeInTheDocument();

      fireEvent.click(screen.getAllByRole("button", { name: "lifecycleResponse" })[0]);
      expect(screen.getAllByText(/1\.20s \(\+900ms\)/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/1\.65s \(\+400ms\)/).length).toBeGreaterThan(0);
    });

    it("restores structured session and candidate upstream diagnostics in expanded view", () => {
      const sessionId = "session-1234567890abcdef";
      const logWithRouting: RequestLog = {
        ...logWithFailoverBase,
        routing_decision: mockRoutingDecision,
        session_id: sessionId,
        affinity_hit: true,
        session_id_compensated: true,
      };

      render(<LogsTable logs={[logWithRouting]} />);

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));
      fireEvent.click(screen.getAllByRole("button", { name: "lifecycleDecision" })[0]);

      expect(screen.getByText("timelineSessionAffinity")).toBeInTheDocument();
      expect(screen.getByTitle(sessionId)).toBeInTheDocument();
      expect(screen.getByText("compensationBadge")).toBeInTheDocument();
      expect(screen.getByText(/weighted_random/)).toBeInTheDocument();
      expect(screen.getAllByText("journeySelectionReasonWeighted").length).toBeGreaterThan(0);
      expect(screen.getByText("openai-1")).toBeInTheDocument();
      expect(screen.getByText("openai-3")).toBeInTheDocument();
      expect(screen.getByText("w:100")).toBeInTheDocument();
      expect(screen.getByText("circuitState.half_open")).toBeInTheDocument();
      const concurrencyFullBadges = screen.getAllByText("exclusionReason.concurrency_full");
      expect(concurrencyFullBadges.length).toBeGreaterThan(0);
      expect(
        hasAncestorClass(screen.getByText("circuitState.half_open"), "text-status-warning")
      ).toBe(true);
      expect(hasAncestorClass(screen.getByText("openai-2"), "bg-status-warning-muted/10")).toBe(
        true
      );
      expect(hasAncestorClass(concurrencyFullBadges[0], "text-status-warning")).toBe(true);

      fireEvent.click(screen.getAllByRole("button", { name: "lifecycleRequest" })[0]);
      expect(screen.getAllByText("journeyRetryReasonText").length).toBeGreaterThan(0);
      fireEvent.click(screen.getAllByRole("button", { name: "lifecycleDecision" })[0]);
      expect(screen.getByText(/journeySelectedCircuitState/)).toBeInTheDocument();
    });

    it("shows queue termination chain in the request stage detail", () => {
      const logWithQueuedTimeout: RequestLog = {
        ...mockLog,
        status_code: 504,
        failover_attempts: 0,
        failover_history: null,
        routing_decision: {
          ...mockRoutingDecision,
          selected_upstream_id: null,
          queue: {
            status: "timed_out",
            upstream_id: "upstream-2",
            entered_at: attemptedAt,
            wait_duration_ms: 30000,
            timeout_ms: 30000,
          },
          did_send_upstream: false,
          final_selection_reason: null,
        },
      };

      render(<LogsTable logs={[logWithQueuedTimeout]} />);

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));
      fireEvent.click(screen.getAllByRole("button", { name: "lifecycleRequest" })[0]);

      expect(screen.getAllByText("queueStatus.timed_out").length).toBeGreaterThan(0);
      expect(screen.getByText("journeyQueueLifecycle.timed_out")).toBeInTheDocument();
      expect(screen.getByText(/journeyQueueTarget/)).toBeInTheDocument();
    });

    it("uses error styling for circuit-open excluded upstreams in expanded view", () => {
      const logWithCircuitOpenExclusion: RequestLog = {
        ...logWithFailoverBase,
        routing_decision: {
          ...mockRoutingDecision,
          excluded: [
            ...mockRoutingDecision.excluded,
            { id: "upstream-4", name: "openai-4", reason: "circuit_open" },
          ],
        },
      };

      render(<LogsTable logs={[logWithCircuitOpenExclusion]} />);

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));
      fireEvent.click(screen.getAllByRole("button", { name: "lifecycleDecision" })[0]);

      expect(screen.getByText("openai-4")).toBeInTheDocument();
      expect(screen.getByText("exclusionReason.circuit_open")).toBeInTheDocument();
      expect(
        hasAncestorClass(screen.getByText("exclusionReason.circuit_open"), "text-status-error")
      ).toBe(true);
      expect(hasAncestorClass(screen.getByText("openai-4"), "bg-status-error-muted/10")).toBe(true);
    });

    it("shows session affinity stage when routing decision is null", () => {
      render(<LogsTable logs={[logWithFailoverBase]} />);

      // Click expand button
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      fireEvent.click(screen.getAllByRole("button", { name: "lifecycleDecision" })[0]);
      expect(screen.getByText("timelineSessionAffinity")).toBeInTheDocument();
      expect(screen.getByText("journeySelectionBasis")).toBeInTheDocument();

      fireEvent.click(screen.getAllByRole("button", { name: "lifecycleRequest" })[0]);
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

      // Retry timeline should show attempt with upstream name, reason, and error message
      expect(screen.getAllByText(/retryAttempt/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/failed-upstream/).length).toBeGreaterThan(0);
      expect(screen.getAllByText("journeySelectionReasonWeighted").length).toBeGreaterThan(0);
      expect(screen.getByText(/Request timed out/)).toBeInTheDocument();
      const errorText = screen.getByText(/Request timed out/);
      let current: HTMLElement | null = errorText as HTMLElement;
      let hasErrorClass = false;
      while (current) {
        if (current.className?.toString().includes("text-status-error")) {
          hasErrorClass = true;
          break;
        }
        current = current.parentElement;
      }
      expect(hasErrorClass).toBe(true);
      expect(screen.getAllByText(/retryTotalDuration/).length).toBeGreaterThan(0);
    });

    it("uses the same failover duration text in request header and details", () => {
      const requestStart = new Date();
      const failoverAt = new Date(requestStart.getTime() + 580);
      const logWithStableFailoverDuration: RequestLog = {
        ...logWithFailoverBase,
        created_at: requestStart.toISOString(),
        duration_ms: 1000,
        failover_history: [
          {
            ...logWithFailoverBase.failover_history![0],
            attempted_at: failoverAt.toISOString(),
          },
        ],
      };

      render(<LogsTable logs={[logWithStableFailoverDuration]} />);

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      expect(screen.getByText(/retryTotalDuration 420ms \(\+420ms\)/)).toBeInTheDocument();
      expect(screen.getByText("420ms (+420ms)")).toBeInTheDocument();
      expect(screen.getAllByText(/retryTotalDuration/).length).toBeGreaterThan(0);
    });

    it("shows a 5m badge on cache write and hides duplicate TTL row in expanded token details", () => {
      const logWithSingleTtlBucket: RequestLog = {
        ...logWithFailoverBase,
        cache_creation_tokens: 150,
        cache_creation_5m_tokens: 150,
        cache_creation_1h_tokens: 0,
      };

      render(<LogsTable logs={[logWithSingleTtlBucket]} />);

      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      const cacheWriteRow = screen.getByText("tokenCacheWrite").closest("div")?.parentElement;
      expect(cacheWriteRow).not.toBeNull();
      expect(within(cacheWriteRow as HTMLElement).getByText("5m")).toBeInTheDocument();
      expect(screen.queryByText("tokenCacheWrite5m")).not.toBeInTheDocument();
      expect(screen.queryByText("tokenCacheWrite1h")).not.toBeInTheDocument();
    });

    it("shows cache TTL split rows in expanded token details when values are both present", () => {
      const logWithTtlSplit: RequestLog = {
        ...logWithFailoverBase,
        cache_creation_tokens: 150,
        cache_creation_5m_tokens: 120,
        cache_creation_1h_tokens: 30,
      };

      render(<LogsTable logs={[logWithTtlSplit]} />);

      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      expect(screen.getByText("tokenCacheWrite")).toBeInTheDocument();
      expect(screen.getByText("tokenCacheWrite5m")).toBeInTheDocument();
      expect(screen.getByText("tokenCacheWrite1h")).toBeInTheDocument();
    });

    it("hides cache TTL split rows in expanded token details when values are 0", () => {
      const logWithoutTtlSplit: RequestLog = {
        ...logWithFailoverBase,
        cache_creation_tokens: 150,
        cache_creation_5m_tokens: 0,
        cache_creation_1h_tokens: 0,
      };

      render(<LogsTable logs={[logWithoutTtlSplit]} />);

      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      expect(screen.getByText("tokenCacheWrite")).toBeInTheDocument();
      expect(screen.queryByText("tokenCacheWrite5m")).not.toBeInTheDocument();
      expect(screen.queryByText("tokenCacheWrite1h")).not.toBeInTheDocument();
    });

    it("displays sequential lifecycle flow alongside expanded token details", () => {
      const logWithRouting: RequestLog = {
        ...logWithFailoverBase,
        routing_decision: mockRoutingDecision,
      };

      const { container } = render(<LogsTable logs={[logWithRouting]} />);

      // Click expand button
      const expandButton = screen.getByRole("button", { name: "expandDetails" });
      fireEvent.click(expandButton);

      expect(screen.getByRole("button", { name: "journeyRequestArrived" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "lifecycleDecision" }).length).toBeGreaterThan(
        0
      );
      expect(screen.queryByText("timelineUpstreamSelection")).not.toBeInTheDocument();
      expect(screen.getByText("lifecycleTimeline")).toBeInTheDocument();
      expect(screen.getByText("tokenDetails")).toBeInTheDocument();

      fireEvent.click(screen.getAllByRole("button", { name: "lifecycleDecision" })[0]);
      expect(screen.getByText("journeyDecisionResult")).toBeInTheDocument();

      const focusRail = container.querySelector("[class*='xl:grid-cols-5']");
      expect(focusRail).toBeInTheDocument();
    });

    it("shows each lifecycle stage detail when its journey step is selected", () => {
      const logWithRouting: RequestLog = {
        ...logWithFailoverBase,
        routing_decision: mockRoutingDecision,
        is_stream: true,
        duration_ms: 1650,
        routing_duration_ms: 300,
        ttft_ms: 900,
        completion_tokens: 120,
        stage_timings_ms: {
          total_ms: 1650,
          decision_ms: 300,
          upstream_response_ms: 950,
          first_token_ms: 900,
          generation_ms: 400,
          gateway_processing_ms: null,
        },
      };

      render(<LogsTable logs={[logWithRouting]} />);

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      fireEvent.click(screen.getAllByRole("button", { name: "lifecycleDecision" })[0]);
      expect(screen.getByText("journeyDecisionResult")).toBeInTheDocument();

      fireEvent.click(screen.getAllByRole("button", { name: "lifecycleRequest" })[0]);
      expect(screen.getByText("timelineExecutionRetries")).toBeInTheDocument();

      fireEvent.click(screen.getAllByRole("button", { name: "lifecycleResponse" })[0]);
      expect(screen.getAllByText(/1\.65s \(\+400ms\)/).length).toBeGreaterThan(0);
    });

    it("falls back to request-arrived content in focused view when no focused detail exists", () => {
      const logWithRouting: RequestLog = {
        ...logWithFailoverBase,
        routing_decision: mockRoutingDecision,
      };

      render(<LogsTable logs={[logWithRouting]} />);

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));
      fireEvent.click(screen.getByRole("button", { name: "journeyRequestArrived" }));

      expect(screen.getByText("requestKey")).toBeInTheDocument();
      expect(screen.getAllByText("Primary Key").length).toBeGreaterThan(0);
      expect(screen.getByText("/v1/chat/completions")).toBeInTheDocument();
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

    it("keeps header diff collapsed by default and expands on demand", () => {
      const logWithHeaderDiff: RequestLog = {
        ...logWithFailoverBase,
        header_diff: {
          inbound_count: 3,
          outbound_count: 2,
          dropped: [{ header: "x-forwarded-for", value: "127.0.0.1" }],
          auth_replaced: {
            header: "authorization",
            inbound_value: "Bearer sk-old-token",
            outbound_value: "Bearer sk-new-token",
          },
          compensated: [],
          unchanged: [],
        },
      };

      render(<LogsTable logs={[logWithHeaderDiff]} />);

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      expect(screen.getByText("headerDiffTitle")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Expand diff" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "headerDiffShowValues" })
      ).not.toBeInTheDocument();
      expect(screen.queryByText("authorization")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Expand diff" }));

      expect(screen.getByRole("button", { name: "Collapse diff" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "headerDiffShowValues" })).toBeInTheDocument();
      expect(screen.getByText("authorization")).toBeInTheDocument();
    });
  });

  describe("Log Recording Section", () => {
    it("mounts the recording section inside the expanded row with the log id and enabled flag", () => {
      render(<LogsTable logs={[mockLog]} />);

      expect(screen.queryByTestId("log-recording-section")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      const section = screen.getByTestId("log-recording-section");
      expect(section).toBeInTheDocument();
      expect(section.getAttribute("data-log-id")).toBe(mockLog.id);
      expect(section.getAttribute("data-enabled")).toBe("true");
    });
  });
});
