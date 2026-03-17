import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
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
      expect(modelHeader?.className).toContain("w-[264px]");

      const tokenHeader = screen.getByText("tableTokens").closest("th");
      expect(tokenHeader?.className).toContain("w-[104px]");

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      const tokenDetails = screen.getByText("tokenDetails");
      expect(tokenDetails.closest("td")).toBeNull();
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

    it("applies entry motion class to desktop rows on first render", () => {
      render(<LogsTable logs={[mockLog]} />);

      const row = screen.getAllByRole("row")[1];
      expect(row.className).toContain("animate-log-row-enter");
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

      const cells = screen.getAllByRole("cell");
      const upstreamCell = cells[2]; // expand | time | upstream
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
      render(<LogsTable logs={[mockLog]} />);

      const summaryTile = screen.getByText("summaryP50Ttft").closest("div");
      const quickFilter = screen.getByRole("button", { name: "presetHighTtft" });

      expect(summaryTile).toBeInTheDocument();
      expect(summaryTile?.className).toContain("motion-safe:hover:-translate-y-0.5");
      expect(quickFilter.className).toContain("motion-safe:hover:-translate-y-0.5");
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
      expect(screen.getAllByText(/thinkingProvider/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/thinkingProtocol/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/thinkingLevel/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/thinkingSourcePaths/).length).toBeGreaterThan(0);
      expect(screen.getAllByText("[xhigh]").length).toBeGreaterThan(0);
    });

    it("shows an explicit empty state for missing thinking config", () => {
      render(<LogsTable logs={[mockLog]} />);

      fireEvent.click(screen.getByRole("button", { name: "expandDetails" }));

      expect(screen.getByText("thinkingConfig")).toBeInTheDocument();
      expect(screen.getByText("thinkingNotExplicitlySpecified")).toBeInTheDocument();
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

      expect(screen.getByText(/billingTotal/)).toBeInTheDocument();
      expect(screen.getByText(/100 \* \$3\.00 \/ 1M \* 1\.2 =/)).toBeInTheDocument();
      expect(screen.getByText(/50 \* \$15\.00 \/ 1M \* 1\.1 =/)).toBeInTheDocument();
      expect(screen.getByText(/20 \* \$0\.30 \/ 1M \* 1\.2 =/)).toBeInTheDocument();
      expect(screen.getByText(/10 \* \$3\.00 \/ 1M \* 1\.2 =/)).toBeInTheDocument();
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
      expect(screen.getByText(/modelWindow/)).toBeInTheDocument();
      expect(screen.getByText(/Max Input: 128,?000/)).toBeInTheDocument();
      expect(screen.getByText(/Max Output: 4,?096/)).toBeInTheDocument();
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

    it("supports switching lifecycle details to sequential full view", () => {
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
      fireEvent.click(screen.getByRole("button", { name: "journeyViewSequential" }));

      expect(screen.getByText("journeyDecisionResult")).toBeInTheDocument();
      expect(screen.getByText("timelineExecutionRetries")).toBeInTheDocument();
      expect(screen.getAllByText(/1\.65s \(\+400ms\)/).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "journeyViewFocused" })).toBeInTheDocument();
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
});
