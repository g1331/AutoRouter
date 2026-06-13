import { render } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it } from "vitest";

import enMessages from "@/messages/en.json";
import zhCNMessages from "@/messages/zh-CN.json";
import { FAILOVER_ERROR_TYPES } from "@/lib/constants/failover-error-types";
import type { FailoverErrorType } from "@/types/api";

const LOCALES = [
  { locale: "en", messages: enMessages },
  { locale: "zh-CN", messages: zhCNMessages },
] as const;

/**
 * 复刻 `upstream-failure-rules-editor.tsx` 中 `getErrorTypeLabel` 的确切调用形态：
 * `useTranslations("logs")` + `t(`retryErrorType.${type}`)`。
 *
 * editor 自身的组件测试 mock 了 next-intl，无法暴露 namespace 写错（曾误用不存在的
 * `requestLogs` 顶层 namespace、且这个 next-intl 版本不支持 namespace 内含点号）。
 * 这里用真实的 next-intl + 真实消息文件做契约测试，确保每个故障类型在两种语言下都能
 * 解析出真实译文，而不是回退成原始 key 路径。
 */
function ErrorTypeLabels() {
  const t = useTranslations("logs");
  return (
    <ul>
      {FAILOVER_ERROR_TYPES.map((type: FailoverErrorType) => (
        <li key={type} data-testid={`label-${type}`}>
          {t(`retryErrorType.${type}`)}
        </li>
      ))}
    </ul>
  );
}

describe("故障类型标签的 i18n 解析", () => {
  for (const { locale, messages } of LOCALES) {
    it(`在 ${locale} 下每个 FAILOVER_ERROR_TYPES 都解析为真实译文`, () => {
      const retryErrorType = (messages as { logs: { retryErrorType: Record<string, string> } }).logs
        .retryErrorType;

      const { getByTestId } = render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ErrorTypeLabels />
        </NextIntlClientProvider>
      );

      for (const type of FAILOVER_ERROR_TYPES) {
        const rendered = getByTestId(`label-${type}`).textContent;
        // 与消息文件中的取值逐一对齐：既验证 namespace 解析正确，也验证译文完整。
        expect(rendered).toBe(retryErrorType[type]);
        // 防回退：不得渲染成原始 key 路径（namespace 写错时 next-intl 的回退形态）。
        expect(rendered).not.toBe(`retryErrorType.${type}`);
      }
    });
  }
});
