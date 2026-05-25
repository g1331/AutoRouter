import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CliproxyConnectionTestResult } from "@/types/cliproxy";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { CliproxyConnectionResult } from "@/components/admin/cliproxy-connection-result";

function build(
  status: CliproxyConnectionTestResult["status"],
  message = "raw error"
): CliproxyConnectionTestResult {
  return { status, message };
}

describe("CliproxyConnectionResult", () => {
  it("unreachable 状态下额外展示 localhost 陷阱提示", () => {
    render(<CliproxyConnectionResult result={build("unreachable")} />);
    expect(screen.getByText("testStatus_unreachable")).toBeInTheDocument();
    expect(screen.getByText("testStatus_unreachable_hint")).toBeInTheDocument();
    expect(screen.getByText("raw error")).toBeInTheDocument();
  });

  it("success 状态不展示 unreachable 提示", () => {
    render(<CliproxyConnectionResult result={build("success", "ok")} />);
    expect(screen.queryByText("testStatus_unreachable_hint")).not.toBeInTheDocument();
  });

  it("auth_failed 状态不展示 unreachable 提示", () => {
    render(<CliproxyConnectionResult result={build("auth_failed", "401")} />);
    expect(screen.queryByText("testStatus_unreachable_hint")).not.toBeInTheDocument();
  });

  it("service_error 状态不展示 unreachable 提示", () => {
    render(<CliproxyConnectionResult result={build("service_error", "500")} />);
    expect(screen.queryByText("testStatus_unreachable_hint")).not.toBeInTheDocument();
  });
});
