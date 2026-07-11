import type { ReactElement } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { TruncatedTextTooltip } from "@/components/logs/truncated-text-tooltip";
import {
  RequestKeyIdentity,
  getRequestKeyDisplayMeta,
} from "@/components/logs/request-key-identity";
import { ModelIdentity, getReasoningEffortLevel } from "@/components/logs/model-identity";
import { ThinkingConfigPanel } from "@/components/logs/thinking-config-panel";
import type { RequestLog, RequestThinkingConfig } from "@/types/api";

// TruncatedTextTooltip renders a Radix Tooltip; logs-table.tsx supplies the
// TooltipProvider ancestor in the real app, so the extracted-component tests
// must recreate it here or Tooltip.Root throws on mount.
function renderWithTooltip(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

// Mirrors tests/components/logs-table.test.tsx: these components were extracted
// verbatim out of logs-table.tsx and inherit its next-intl mocking convention.
// Namespace + key are echoed back so aria-label / badge text assertions can
// distinguish which translation key fired without needing real message files
// (that coverage lives in the tests/unit/i18n contract test instead).
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
    const prefix = namespace ? `${namespace}.${key}` : key;
    return values && Object.keys(values).length > 0
      ? `${prefix}(${JSON.stringify(values)})`
      : prefix;
  },
}));

describe("TruncatedTextTooltip", () => {
  it("renders the provided text", () => {
    renderWithTooltip(<TruncatedTextTooltip text="gpt-4-turbo-preview" />);
    expect(screen.getByText("gpt-4-turbo-preview")).toBeInTheDocument();
  });

  it("applies the className to the truncated trigger span", () => {
    renderWithTooltip(
      <TruncatedTextTooltip text="sk-ar-primary" className="custom-trigger-class" />
    );
    expect(screen.getByText("sk-ar-primary")).toHaveClass("custom-trigger-class");
  });
});

describe("getRequestKeyDisplayMeta", () => {
  it("prefers name + prefix when both are present", () => {
    const meta = getRequestKeyDisplayMeta({
      keyName: "Primary Key",
      keyPrefix: "sk-primary",
      fallbackLabel: "unknownKey",
    });

    expect(meta).toEqual({
      primaryLabel: "Primary Key",
      secondaryLabel: "sk-primary",
      tooltipLabel: "Primary Key · sk-primary",
      hasKeyData: true,
    });
  });

  it("falls back to name-only when prefix is missing", () => {
    const meta = getRequestKeyDisplayMeta({
      keyName: "Primary Key",
      keyPrefix: null,
      fallbackLabel: "unknownKey",
    });

    expect(meta).toEqual({
      primaryLabel: "Primary Key",
      secondaryLabel: null,
      tooltipLabel: "Primary Key",
      hasKeyData: true,
    });
  });

  it("falls back to prefix-only when name is missing", () => {
    const meta = getRequestKeyDisplayMeta({
      keyName: undefined,
      keyPrefix: "sk-primary",
      fallbackLabel: "unknownKey",
    });

    expect(meta).toEqual({
      primaryLabel: "sk-primary",
      secondaryLabel: null,
      tooltipLabel: "sk-primary",
      hasKeyData: true,
    });
  });

  it("reports anonymous (no key data) when both are missing", () => {
    const meta = getRequestKeyDisplayMeta({
      keyName: null,
      keyPrefix: null,
      fallbackLabel: "unknownKey",
    });

    expect(meta).toEqual({
      primaryLabel: "unknownKey",
      secondaryLabel: null,
      tooltipLabel: "unknownKey",
      hasKeyData: false,
    });
  });

  it("treats whitespace-only name/prefix as absent", () => {
    const meta = getRequestKeyDisplayMeta({
      keyName: "   ",
      keyPrefix: "  ",
      fallbackLabel: "unknownKey",
    });

    expect(meta.hasKeyData).toBe(false);
    expect(meta.primaryLabel).toBe("unknownKey");
  });
});

describe("RequestKeyIdentity", () => {
  it("renders the key name with a prefix badge", () => {
    renderWithTooltip(<RequestKeyIdentity keyName="Primary Key" keyPrefix="sk-primary" />);

    expect(screen.getByText("Primary Key")).toBeInTheDocument();
    const prefixBadge = screen.getByText("sk-primary");
    expect(prefixBadge).toHaveAttribute("title", "sk-primary");
  });

  it("renders only the primary label when there is no prefix", () => {
    renderWithTooltip(<RequestKeyIdentity keyName="Primary Key" keyPrefix={null} />);

    expect(screen.getByText("Primary Key")).toBeInTheDocument();
    expect(screen.queryByTitle("sk-primary")).not.toBeInTheDocument();
  });

  it("renders the muted anonymous fallback when there is no key data", () => {
    renderWithTooltip(<RequestKeyIdentity keyName={null} keyPrefix={null} />);

    const fallback = screen.getByText("logs.unknownKey");
    expect(fallback).toHaveClass("text-muted-foreground");
  });

  it("shrinks the prefix badge padding in compact mode", () => {
    renderWithTooltip(<RequestKeyIdentity keyName="Primary Key" keyPrefix="sk-primary" compact />);

    const prefixBadge = screen.getByText("sk-primary");
    expect(prefixBadge).toHaveClass("px-1", "py-0", "text-[9px]");
  });
});

describe("getReasoningEffortLevel", () => {
  const baseLog = { id: "log-1" } as RequestLog;

  it("reads the reasoning_effort field", () => {
    expect(getReasoningEffortLevel({ ...baseLog, reasoning_effort: "high" })).toBe("high");
  });

  it("falls back to the camelCase reasoningEffort field", () => {
    expect(getReasoningEffortLevel({ ...baseLog, reasoningEffort: "medium" } as RequestLog)).toBe(
      "medium"
    );
  });

  it("falls back to the thinking_level field", () => {
    expect(getReasoningEffortLevel({ ...baseLog, thinking_level: "low" } as RequestLog)).toBe(
      "low"
    );
  });

  it("falls back to the camelCase thinkingLevel field", () => {
    expect(getReasoningEffortLevel({ ...baseLog, thinkingLevel: "xhigh" } as RequestLog)).toBe(
      "xhigh"
    );
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(getReasoningEffortLevel({ ...baseLog, reasoning_effort: " High " } as RequestLog)).toBe(
      "high"
    );
  });

  it("returns null for an unrecognized string value", () => {
    expect(
      getReasoningEffortLevel({ ...baseLog, reasoning_effort: "ultra" } as RequestLog)
    ).toBeNull();
  });

  it("returns null for a non-string value", () => {
    expect(getReasoningEffortLevel({ ...baseLog, reasoning_effort: 5 } as RequestLog)).toBeNull();
  });

  it("returns null when none of the source fields are present", () => {
    expect(getReasoningEffortLevel(baseLog)).toBeNull();
  });
});

describe("ModelIdentity", () => {
  it("renders the model label", () => {
    renderWithTooltip(<ModelIdentity label="gpt-4" />);
    expect(screen.getByText("gpt-4")).toBeInTheDocument();
  });

  it("renders a dash when the label is null", () => {
    renderWithTooltip(<ModelIdentity label={null} />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it.each([
    ["high", "High"],
    ["xhigh", "XHigh"],
    ["medium", "Medium"],
    ["none", "None"],
  ] as const)("renders the %s reasoning effort badge as %s", (level, expectedText) => {
    renderWithTooltip(<ModelIdentity label="gpt-4" reasoningEffort={level} />);
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });

  it("keeps the bracketed thinking badge when there is no reasoning effort", () => {
    const thinkingConfig = {
      provider: "openai",
      protocol: "openai_chat",
      mode: "reasoning",
      level: "high",
      budget_tokens: null,
      include_thoughts: null,
      source_paths: ["reasoning_effort"],
    } as RequestThinkingConfig;

    renderWithTooltip(<ModelIdentity label="gpt-4" thinkingConfig={thinkingConfig} />);

    expect(screen.getByText("[high]")).toBeInTheDocument();
  });

  it("dedupes the thinking badge when it mirrors the reasoning effort badge", () => {
    const thinkingConfig = {
      provider: "openai",
      protocol: "openai_chat",
      mode: "reasoning",
      level: "high",
      budget_tokens: null,
      include_thoughts: null,
      source_paths: ["reasoning_effort"],
    } as RequestThinkingConfig;

    renderWithTooltip(
      <ModelIdentity label="gpt-4" reasoningEffort="high" thinkingConfig={thinkingConfig} />
    );

    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.queryByText("[high]")).not.toBeInTheDocument();
  });

  it("renders a budget badge instead of bracketed text when the thinking config carries a token budget", () => {
    const thinkingConfig = {
      provider: "google",
      protocol: "gemini_generate",
      mode: "thinking",
      level: null,
      budget_tokens: 512,
      include_thoughts: null,
      source_paths: ["generationConfig.thinkingConfig.thinkingBudget"],
    } as RequestThinkingConfig;

    renderWithTooltip(<ModelIdentity label="gemini-2.5-pro" thinkingConfig={thinkingConfig} />);

    expect(screen.getByText("Budget")).toBeInTheDocument();
    expect(screen.getByText("512")).toBeInTheDocument();
    expect(screen.queryByText("[budget:512]")).not.toBeInTheDocument();
  });

  it("renders no thinking badge when thinkingConfig is null", () => {
    renderWithTooltip(<ModelIdentity label="gpt-4" thinkingConfig={null} />);

    expect(screen.queryByText(/^\[.*\]$/)).not.toBeInTheDocument();
    expect(screen.queryByText("Budget")).not.toBeInTheDocument();
  });

  it("shrinks the thinking badge padding in compact mode", () => {
    const thinkingConfig = {
      provider: "openai",
      protocol: "openai_chat",
      mode: "reasoning",
      level: "high",
      budget_tokens: null,
      include_thoughts: null,
      source_paths: ["reasoning_effort"],
    } as RequestThinkingConfig;

    renderWithTooltip(
      <ModelIdentity label="gpt-4" thinkingConfig={thinkingConfig} compactBadges />
    );

    expect(screen.getByText("[high]")).toHaveClass("px-1", "py-0", "text-[9px]");
  });
});

describe("ThinkingConfigPanel", () => {
  it("renders the not-explicitly-specified summary when there is no config", () => {
    render(<ThinkingConfigPanel thinkingConfig={null} />);

    expect(screen.getByText("logs.thinkingConfig")).toBeInTheDocument();
    expect(screen.getByText("logs.thinkingNotExplicitlySpecified")).toBeInTheDocument();
  });

  it("toggles the expand/collapse state on click", () => {
    render(<ThinkingConfigPanel thinkingConfig={null} />);

    const toggle = screen.getByRole("button", { name: "Expand thinking details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName("Collapse thinking details");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("renders the full config fields once expanded", () => {
    const thinkingConfig: RequestThinkingConfig = {
      provider: "anthropic",
      protocol: "anthropic_messages",
      mode: "manual",
      level: null,
      budget_tokens: 2048,
      include_thoughts: true,
      source_paths: ["thinking.type", "thinking.budget_tokens"],
    };

    render(<ThinkingConfigPanel thinkingConfig={thinkingConfig} />);

    fireEvent.click(screen.getByRole("button", { name: /expand/i }));

    expect(screen.getByText("logs.thinkingProvider")).toBeInTheDocument();
    expect(screen.getByText("logs.thinkingProviderValue.anthropic")).toBeInTheDocument();
    expect(screen.getByText("logs.thinkingProtocol")).toBeInTheDocument();
    expect(screen.getByText("logs.thinkingProtocolValue.anthropic_messages")).toBeInTheDocument();
    expect(screen.getByText("logs.thinkingMode")).toBeInTheDocument();
    expect(screen.getByText("logs.thinkingModeValue.manual")).toBeInTheDocument();
    expect(screen.getByText("logs.thinkingLevel")).toBeInTheDocument();
    expect(screen.getByText("2,048")).toBeInTheDocument();
    expect(screen.getByText("logs.thinkingBooleanEnabled")).toBeInTheDocument();
    expect(screen.getByText("thinking.type · thinking.budget_tokens")).toBeInTheDocument();
  });

  it("renders unset placeholders for absent optional fields", () => {
    const thinkingConfig: RequestThinkingConfig = {
      provider: "openai",
      protocol: "openai_chat",
      mode: "reasoning",
      level: null,
      budget_tokens: null,
      include_thoughts: null,
      source_paths: [],
    };

    render(<ThinkingConfigPanel thinkingConfig={thinkingConfig} />);

    fireEvent.click(screen.getByRole("button", { name: /expand/i }));

    const unsetValues = screen.getAllByText("logs.thinkingValueUnset");
    // level, budget_tokens, include_thoughts, source_paths all fall back to the
    // same unset placeholder when the field carries no information.
    expect(unsetValues.length).toBe(4);
  });

  it("collapses the detail rows again when toggled closed", () => {
    const thinkingConfig: RequestThinkingConfig = {
      provider: "openai",
      protocol: "openai_chat",
      mode: "reasoning",
      level: "high",
      budget_tokens: null,
      include_thoughts: null,
      source_paths: ["reasoning_effort"],
    };

    render(<ThinkingConfigPanel thinkingConfig={thinkingConfig} />);

    const toggle = screen.getByRole("button", { name: /expand/i });
    fireEvent.click(toggle);
    expect(screen.getByText("logs.thinkingProvider")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByText("logs.thinkingProvider")).not.toBeInTheDocument();
  });
});
