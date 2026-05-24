import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamFailureRulesEditor } from "@/components/admin/upstream-failure-rules-editor";
import type { UpstreamFailureRule } from "@/types/api";

vi.mock("@/components/admin/failover-error-type-multi-select", () => ({
  FailoverErrorTypeMultiSelect: ({
    value,
    onChange,
  }: {
    value: string[];
    onChange: (next: string[]) => void;
  }) => (
    <div data-testid="error-types-multi-select">
      {[
        "timeout",
        "first_byte_timeout",
        "upstream_no_content_stream",
        "stream_idle_timeout",
        "stream_error",
        "http_5xx",
        "http_4xx",
        "http_429",
        "connection_error",
        "circuit_open",
        "concurrency_full",
      ].map((type) => (
        <button
          key={type}
          type="button"
          aria-label={`add-${type}`}
          onClick={() => {
            if (!value.includes(type)) onChange([...value, type]);
          }}
        >
          add-{type}
        </button>
      ))}
      <ul>
        {value.map((entry) => (
          <li key={entry} data-testid="error-types-selected">
            {entry}
          </li>
        ))}
      </ul>
    </div>
  ),
}));

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

const mockCreateMutateAsync = vi.fn();
const mockCreateGlobalMutateAsync = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();

const hookState = {
  rules: [] as UpstreamFailureRule[],
  isLoading: false,
  createPending: false,
};

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values?.message ? `${key}:${values.message}` : key,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

vi.mock("@/hooks/use-upstreams", () => ({
  useUpstreamFailureRules: () => ({
    data: hookState.rules,
    isLoading: hookState.isLoading,
  }),
  useGlobalUpstreamFailureRules: () => ({
    data: hookState.rules,
    isLoading: hookState.isLoading,
  }),
  useCreateUpstreamFailureRule: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: hookState.createPending,
  }),
  useCreateGlobalUpstreamFailureRule: () => ({
    mutateAsync: mockCreateGlobalMutateAsync,
    isPending: hookState.createPending,
  }),
  useUpdateUpstreamFailureRule: () => ({
    mutate: mockUpdateMutate,
  }),
  useDeleteUpstreamFailureRule: () => ({
    mutate: mockDeleteMutate,
  }),
}));

const now = "2026-05-16T00:00:00.000Z";

function createRule(overrides: Partial<UpstreamFailureRule> = {}): UpstreamFailureRule {
  return {
    id: "rule-1",
    upstream_id: "upstream-1",
    name: "Gateway timeout failures",
    enabled: true,
    priority: 0,
    match: {
      status_codes: [502, 503],
      error_types: ["timeout"],
      body_pattern: "overloaded",
      header_name: "x-router-error",
      header_pattern: "retry",
    },
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe("UpstreamFailureRulesEditor", () => {
  beforeEach(() => {
    hookState.rules = [];
    hookState.isLoading = false;
    hookState.createPending = false;
    mockCreateMutateAsync.mockReset();
    mockCreateGlobalMutateAsync.mockReset();
    mockUpdateMutate.mockReset();
    mockDeleteMutate.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  it("shows create-mode guidance when upstream id is unavailable", () => {
    render(<UpstreamFailureRulesEditor />);

    expect(screen.getByText("localFailureRulesCreateModeHint")).toBeInTheDocument();
  });

  it("shows loading and empty states", () => {
    hookState.isLoading = true;
    const { rerender } = render(<UpstreamFailureRulesEditor upstreamId="upstream-1" />);

    expect(screen.getByText("failureRulesLoading")).toBeInTheDocument();

    hookState.isLoading = false;
    rerender(<UpstreamFailureRulesEditor upstreamId="upstream-1" />);

    expect(screen.getByText("localFailureRulesEmpty")).toBeInTheDocument();
  });

  it("renders global empty state without save-upstream guidance", () => {
    render(<UpstreamFailureRulesEditor scope="global" />);

    expect(screen.queryByText("localFailureRulesCreateModeHint")).not.toBeInTheDocument();
    expect(screen.getByText("globalFailureRulesEmpty")).toBeInTheDocument();
  });

  it("renders rule summaries and updates rule enabled state", () => {
    hookState.rules = [createRule()];
    render(<UpstreamFailureRulesEditor upstreamId="upstream-1" />);

    expect(screen.getByText("Gateway timeout failures")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("failureRuleSearchPlaceholder")).toBeInTheDocument();
    expect(screen.getByText("failureRuleConditions")).toBeInTheDocument();
    expect(screen.getByText("failureRuleStatusCodes")).toBeInTheDocument();
    expect(screen.getByText("502, 503")).toBeInTheDocument();
    expect(screen.getByText("failureRuleErrorTypes")).toBeInTheDocument();
    expect(screen.getByText("timeout")).toBeInTheDocument();
    expect(screen.getByText("failureRuleBodyPattern")).toBeInTheDocument();
    expect(screen.getByText("/overloaded/")).toBeInTheDocument();
    expect(screen.getByText("failureRuleHeaderPattern")).toBeInTheDocument();
    expect(screen.getByText("x-router-error: /retry/")).toBeInTheDocument();
    expect(screen.getByText("failureRuleScopeLocal")).toBeInTheDocument();
    expect(screen.getByText("failureRuleStatusEnabled")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "failureRuleEnabled" }));

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      {
        upstreamId: "upstream-1",
        ruleId: "rule-1",
        data: { enabled: false },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    );

    const [, options] = mockUpdateMutate.mock.calls[0];
    options.onSuccess();
    expect(mockToastSuccess).toHaveBeenCalledWith("failureRuleUpdated");

    options.onError(new Error("update failed"));
    expect(mockToastError).toHaveBeenCalledWith("failureRuleUpdateFailed:update failed");
  });

  it("filters existing rules by name and match details", () => {
    hookState.rules = [
      createRule({ id: "rule-1", name: "Gateway timeout failures" }),
      createRule({
        id: "rule-2",
        name: "Quota errors",
        match: {
          status_codes: [429],
          error_types: ["http_429"],
          body_pattern: "insufficient_quota",
          header_name: null,
          header_pattern: null,
        },
      }),
    ];
    render(<UpstreamFailureRulesEditor upstreamId="upstream-1" />);

    fireEvent.change(screen.getByPlaceholderText("failureRuleSearchPlaceholder"), {
      target: { value: "quota" },
    });

    expect(screen.getByText("Quota errors")).toBeInTheDocument();
    expect(screen.queryByText("Gateway timeout failures")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("failureRuleSearchPlaceholder"), {
      target: { value: "not-found" },
    });

    expect(screen.getByText("failureRuleNoSearchResults")).toBeInTheDocument();
  });

  it("deletes a rule and reports mutation outcomes", () => {
    hookState.rules = [createRule()];
    render(<UpstreamFailureRulesEditor upstreamId="upstream-1" />);

    fireEvent.click(screen.getByRole("button", { name: "deleteFailureRule" }));

    expect(mockDeleteMutate).toHaveBeenCalledWith(
      {
        upstreamId: "upstream-1",
        ruleId: "rule-1",
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    );

    const [, options] = mockDeleteMutate.mock.calls[0];
    options.onSuccess();
    expect(mockToastSuccess).toHaveBeenCalledWith("failureRuleDeleted");

    options.onError(new Error("delete failed"));
    expect(mockToastError).toHaveBeenCalledWith("failureRuleDeleteFailed:delete failed");
  });

  it("updates and deletes global rules with global scope", () => {
    hookState.rules = [createRule({ upstream_id: null })];
    render(<UpstreamFailureRulesEditor scope="global" />);

    fireEvent.click(screen.getByRole("switch", { name: "failureRuleEnabled" }));

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      {
        scope: "global",
        upstreamId: undefined,
        ruleId: "rule-1",
        data: { enabled: false },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "deleteFailureRule" }));

    expect(mockDeleteMutate).toHaveBeenCalledWith(
      {
        scope: "global",
        upstreamId: undefined,
        ruleId: "rule-1",
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    );
  });

  it("creates a rule with normalized match values and resets the draft", async () => {
    mockCreateMutateAsync.mockResolvedValueOnce(createRule());
    render(<UpstreamFailureRulesEditor upstreamId="upstream-1" />);

    const addButton = screen.getByRole("button", { name: "addFailureRule" });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("failureRuleNamePlaceholder"), {
      target: { value: " New local rule " },
    });
    fireEvent.change(screen.getByPlaceholderText("failureRuleStatusCodesPlaceholder"), {
      target: { value: " 429, 200, 99, abc " },
    });
    fireEvent.click(screen.getByLabelText("add-timeout"));
    fireEvent.click(screen.getByLabelText("add-http_5xx"));
    fireEvent.change(screen.getByPlaceholderText("failureRuleBodyPatternPlaceholder"), {
      target: { value: "rate limit" },
    });
    fireEvent.change(screen.getByPlaceholderText("failureRuleHeaderNamePlaceholder"), {
      target: { value: "retry-after" },
    });
    fireEvent.change(screen.getByPlaceholderText("failureRuleHeaderPatternPlaceholder"), {
      target: { value: "\\d+" },
    });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        upstreamId: "upstream-1",
        data: {
          name: "New local rule",
          enabled: true,
          match: {
            status_codes: [429, 200],
            error_types: ["timeout", "http_5xx"],
            body_pattern: "rate limit",
            header_name: "retry-after",
            header_pattern: "\\d+",
          },
        },
      });
    });

    expect(mockToastSuccess).toHaveBeenCalledWith("failureRuleCreated");
    expect(screen.getByPlaceholderText("failureRuleNamePlaceholder")).toHaveValue("");
    expect(screen.getByPlaceholderText("failureRuleStatusCodesPlaceholder")).toHaveValue("");
  });

  it("creates a global rule with normalized match values", async () => {
    mockCreateGlobalMutateAsync.mockResolvedValueOnce(createRule({ upstream_id: null }));
    render(<UpstreamFailureRulesEditor scope="global" />);

    fireEvent.change(screen.getByPlaceholderText("failureRuleNamePlaceholder"), {
      target: { value: " Global rule " },
    });
    fireEvent.change(screen.getByPlaceholderText("failureRuleStatusCodesPlaceholder"), {
      target: { value: " 500, 503 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "addFailureRule" }));

    await waitFor(() => {
      expect(mockCreateGlobalMutateAsync).toHaveBeenCalledWith({
        data: {
          name: "Global rule",
          enabled: true,
          match: {
            status_codes: [500, 503],
            error_types: null,
            body_pattern: null,
            header_name: null,
            header_pattern: null,
          },
        },
      });
    });

    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith("failureRuleCreated");
  });

  it("previews regex matches and blocks invalid regex submissions", () => {
    render(<UpstreamFailureRulesEditor upstreamId="upstream-1" />);

    const addButton = screen.getByRole("button", { name: "addFailureRule" });
    fireEvent.change(screen.getByPlaceholderText("failureRuleNamePlaceholder"), {
      target: { value: "Regex rule" },
    });
    fireEvent.change(screen.getByPlaceholderText("failureRuleBodyPatternPlaceholder"), {
      target: { value: "quota" },
    });

    const [bodySample] = screen.getAllByPlaceholderText("failureRuleRegexSamplePlaceholder");
    fireEvent.change(bodySample, {
      target: { value: "insufficient_quota" },
    });

    expect(screen.getByText("failureRuleRegexMatched")).toBeInTheDocument();
    expect(screen.getByText("failureRuleRegexPreviewMatched")).toBeInTheDocument();
    expect(addButton).toBeEnabled();

    fireEvent.change(screen.getByPlaceholderText("failureRuleBodyPatternPlaceholder"), {
      target: { value: "[" },
    });

    expect(screen.getByText("failureRuleRegexInvalid")).toBeInTheDocument();
    expect(screen.getByText(/failureRuleRegexInvalidDetail/)).toBeInTheDocument();
    expect(addButton).toBeDisabled();
  });

  it("shows regex preview miss when the sample does not match", () => {
    render(<UpstreamFailureRulesEditor upstreamId="upstream-1" />);

    fireEvent.change(screen.getByPlaceholderText("failureRuleHeaderNamePlaceholder"), {
      target: { value: "x-error-code" },
    });
    fireEvent.change(screen.getByPlaceholderText("failureRuleHeaderPatternPlaceholder"), {
      target: { value: "rate_limit" },
    });

    const [, headerSample] = screen.getAllByPlaceholderText("failureRuleRegexSamplePlaceholder");
    fireEvent.change(headerSample, {
      target: { value: "quota_exceeded" },
    });

    expect(screen.getByText("failureRuleRegexNotMatched")).toBeInTheDocument();
    expect(screen.getByText("failureRuleRegexPreviewNotMatched")).toBeInTheDocument();
  });

  it("allows a header-only draft only after both header fields are filled", () => {
    render(<UpstreamFailureRulesEditor upstreamId="upstream-1" />);

    const addButton = screen.getByRole("button", { name: "addFailureRule" });
    fireEvent.change(screen.getByPlaceholderText("failureRuleNamePlaceholder"), {
      target: { value: "Header rule" },
    });
    fireEvent.change(screen.getByPlaceholderText("failureRuleHeaderNamePlaceholder"), {
      target: { value: "x-error" },
    });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("failureRuleHeaderPatternPlaceholder"), {
      target: { value: "failed" },
    });
    expect(addButton).toBeEnabled();
  });

  it("reports create failures without resetting the draft", async () => {
    mockCreateMutateAsync.mockRejectedValueOnce(new Error("invalid regex"));
    render(<UpstreamFailureRulesEditor upstreamId="upstream-1" />);

    fireEvent.change(screen.getByPlaceholderText("failureRuleNamePlaceholder"), {
      target: { value: "Broken rule" },
    });
    fireEvent.change(screen.getByPlaceholderText("failureRuleBodyPatternPlaceholder"), {
      target: { value: "valid-regex" },
    });
    fireEvent.click(screen.getByRole("button", { name: "addFailureRule" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("failureRuleCreateFailed:invalid regex");
    });
    expect(screen.getByPlaceholderText("failureRuleNamePlaceholder")).toHaveValue("Broken rule");
  });
});
