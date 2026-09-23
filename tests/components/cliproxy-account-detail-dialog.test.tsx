import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { CliproxyAccountDetailDialog } from "@/components/admin/cliproxy-account-detail-dialog";
import type { CliproxyAccountUsage, CliproxyAuthAccount } from "@/types/cliproxy";

const account: CliproxyAuthAccount = {
  id: "acc-1",
  instance_id: "instance-1",
  auth_file_name: "codex-a.json",
  provider: "codex",
  email: "a@x.com",
  status: "active",
  disabled: false,
  prefix: "team-a",
  model_count: 5,
  priority: 0,
  note: "hello",
  raw_metadata: { type: "codex", status_message: "ok" },
  last_synced_at: "2025-05-30T12:00:00.000Z",
  created_at: "2025-05-29T12:00:00.000Z",
  updated_at: "2025-05-30T12:00:00.000Z",
};

describe("CliproxyAccountDetailDialog", () => {
  it("渲染账号文件名与基本字段", () => {
    render(<CliproxyAccountDetailDialog account={account} open onClose={vi.fn()} />);

    expect(screen.getByText(/codex-a\.json/)).toBeInTheDocument();
    expect(screen.getByText("a@x.com")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("team-a")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("展示 raw_metadata 中的 status_message", () => {
    render(<CliproxyAccountDetailDialog account={account} open onClose={vi.fn()} />);
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("空字段渲染占位符", () => {
    const minimal: CliproxyAuthAccount = {
      ...account,
      email: null,
      status: null,
      prefix: null,
      priority: null,
      note: null,
      raw_metadata: null,
      last_synced_at: null,
    };
    render(<CliproxyAccountDetailDialog account={minimal} open onClose={vi.fn()} />);
    // 占位符出现多次，至少一次
    expect(screen.getAllByText("accountDetailEmpty").length).toBeGreaterThan(0);
  });

  it("区分近期请求与配额观测，展示模型级信号", () => {
    const usage: CliproxyAccountUsage = {
      auth_file_name: "codex-a.json",
      success: 0,
      failed: 2,
      recent_requests: [{ time: "10:00-10:10", success: 0, failed: 1 }],
      quota: {
        observed_at: "2026-09-23T02:00:00Z",
        signals: { "X-Codex-Primary-Used-Percent": "25" },
      },
      model_quotas: {
        "gpt-6": { observed_at: null, signals: { "X-Codex-Primary-Used-Percent": "75" } },
      },
    };
    render(<CliproxyAccountDetailDialog account={account} usage={usage} open onClose={vi.fn()} />);
    expect(screen.getByText("10:00-10:10")).toBeInTheDocument();
    expect(screen.getByText("usageQuotaCaveat")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("usageModelQuotas")).toBeInTheDocument();
  });
});
