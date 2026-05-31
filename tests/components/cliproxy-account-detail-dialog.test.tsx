import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { CliproxyAccountDetailDialog } from "@/components/admin/cliproxy-account-detail-dialog";
import type { CliproxyAuthAccount } from "@/types/cliproxy";

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
});
