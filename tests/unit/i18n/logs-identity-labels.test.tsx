import { render, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import enMessages from "@/messages/en.json";
import zhCNMessages from "@/messages/zh-CN.json";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RequestKeyIdentity } from "@/components/logs/request-key-identity";
import { ModelIdentity } from "@/components/logs/model-identity";
import { ThinkingConfigPanel } from "@/components/logs/thinking-config-panel";
import type { RequestThinkingConfig } from "@/types/api";

/**
 * The four `src/components/logs/*` primitives were extracted verbatim out of
 * `logs-table.tsx` and their own component tests mock next-intl entirely
 * (`tests/components/logs-identity-components.test.tsx`), which cannot catch a
 * wrong namespace or a missing message key — a mocked `t()` just echoes the key
 * back. This file mirrors `tests/unit/i18n/failover-error-type-labels.test.tsx`:
 * it renders the real components under a real `NextIntlClientProvider` with the
 * real message files, for both locales, so a typo'd `logs.*` key path shows up
 * as a failing assertion instead of silently falling back to the raw key.
 */

const LOCALES = [
  { locale: "en", messages: enMessages },
  { locale: "zh-CN", messages: zhCNMessages },
] as const;

type LogsMessages = {
  logs: {
    unknownKey: string;
    thinkingBadgeAria: string;
    thinkingConfig: string;
    thinkingNotExplicitlySpecified: string;
    thinkingProvider: string;
    thinkingProtocol: string;
    thinkingMode: string;
    thinkingLevel: string;
    thinkingBudgetTokens: string;
    thinkingIncludeThoughts: string;
    thinkingSourcePaths: string;
    thinkingValueUnset: string;
    thinkingBooleanEnabled: string;
    thinkingProviderValue: Record<string, string>;
    thinkingProtocolValue: Record<string, string>;
    thinkingModeValue: Record<string, string>;
  };
};

describe("logs identity components 的 i18n 解析", () => {
  for (const { locale, messages } of LOCALES) {
    const logs = (messages as LogsMessages).logs;

    it(`RequestKeyIdentity 在 ${locale} 下的匿名兜底文案解析为真实译文`, () => {
      const { getByText, queryByText } = render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <RequestKeyIdentity keyName={null} keyPrefix={null} />
        </NextIntlClientProvider>
      );

      expect(getByText(logs.unknownKey)).toBeInTheDocument();
      expect(queryByText("unknownKey")).not.toBeInTheDocument();
    });

    it(`ModelIdentity 在 ${locale} 下的 thinking badge aria-label 插值解析为真实译文`, () => {
      const thinkingConfig = {
        provider: "openai",
        protocol: "openai_chat",
        mode: "reasoning",
        level: "high",
        budget_tokens: null,
        include_thoughts: null,
        source_paths: ["reasoning_effort"],
      } as RequestThinkingConfig;

      const { getByTitle } = render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TooltipProvider>
            <ModelIdentity label="gpt-4" thinkingConfig={thinkingConfig} />
          </TooltipProvider>
        </NextIntlClientProvider>
      );

      const expectedAriaLabel = logs.thinkingBadgeAria.replace("{value}", "high");
      const badge = getByTitle(expectedAriaLabel);
      expect(badge).toBeInTheDocument();
      // 防回退：不得渲染成未插值的原始模板。
      expect(badge.getAttribute("title")).not.toBe(logs.thinkingBadgeAria);
    });

    it(`ThinkingConfigPanel 在 ${locale} 下的空态摘要解析为真实译文`, () => {
      const { getByText } = render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThinkingConfigPanel thinkingConfig={null} />
        </NextIntlClientProvider>
      );

      expect(getByText(logs.thinkingConfig)).toBeInTheDocument();
      expect(getByText(logs.thinkingNotExplicitlySpecified)).toBeInTheDocument();
    });

    it(`ThinkingConfigPanel 在 ${locale} 下展开后的每一行标签与取值都解析为真实译文`, () => {
      const thinkingConfig: RequestThinkingConfig = {
        provider: "anthropic",
        protocol: "anthropic_messages",
        mode: "manual",
        level: null,
        budget_tokens: 2048,
        include_thoughts: true,
        source_paths: ["thinking.type"],
      };

      const { getByText, getByRole } = render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThinkingConfigPanel thinkingConfig={thinkingConfig} />
        </NextIntlClientProvider>
      );

      fireEvent.click(getByRole("button", { name: /./ }));

      expect(getByText(logs.thinkingProvider)).toBeInTheDocument();
      expect(getByText(logs.thinkingProviderValue.anthropic)).toBeInTheDocument();
      expect(getByText(logs.thinkingProtocol)).toBeInTheDocument();
      expect(getByText(logs.thinkingProtocolValue.anthropic_messages)).toBeInTheDocument();
      expect(getByText(logs.thinkingMode)).toBeInTheDocument();
      expect(getByText(logs.thinkingModeValue.manual)).toBeInTheDocument();
      expect(getByText(logs.thinkingLevel)).toBeInTheDocument();
      expect(getByText(logs.thinkingBudgetTokens)).toBeInTheDocument();
      expect(getByText(logs.thinkingIncludeThoughts)).toBeInTheDocument();
      expect(getByText(logs.thinkingBooleanEnabled)).toBeInTheDocument();
      expect(getByText(logs.thinkingSourcePaths)).toBeInTheDocument();
    });
  }
});
