import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
const providerQuotaMock = vi.fn();
vi.mock("@/hooks/use-cliproxy", () => ({
  useCliproxyProviderQuota: (...args: unknown[]) => providerQuotaMock(...args),
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
  beforeEach(() => {
    providerQuotaMock.mockReset();
    providerQuotaMock.mockReturnValue({
      data: null,
      isPending: true,
      isError: false,
      isFetching: true,
      refetch: vi.fn(),
    });
  });

  it("渲染账号文件名与基本字段", () => {
    render(
      <CliproxyAccountDetailDialog
        instanceId="instance-1"
        account={account}
        open
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/codex-a\.json/)).toBeInTheDocument();
    expect(screen.getByText("a@x.com")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("team-a")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("展示 raw_metadata 中的 status_message", () => {
    render(
      <CliproxyAccountDetailDialog
        instanceId="instance-1"
        account={account}
        open
        onClose={vi.fn()}
      />
    );
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
    render(
      <CliproxyAccountDetailDialog
        instanceId="instance-1"
        account={minimal}
        open
        onClose={vi.fn()}
      />
    );
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
    render(
      <CliproxyAccountDetailDialog
        instanceId="instance-1"
        account={account}
        usage={usage}
        open
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("10:00-10:10")).toBeInTheDocument();
    expect(screen.getByText("usageQuotaCaveat")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("usageModelQuotas")).toBeInTheDocument();
  });

  it("优先展示实时供应商剩余额度和重置时间", () => {
    providerQuotaMock.mockReturnValue({
      data: {
        provider: "codex",
        status: "ready",
        reason: null,
        fetched_at: "2026-09-23T00:00:00Z",
        windows: [{ id: "primary", remaining_percent: 75, resets_at: "2026-09-24T00:00:00Z" }],
      },
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    render(
      <CliproxyAccountDetailDialog
        instanceId="instance-1"
        account={account}
        open
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("providerQuotaWindow.primary")).toBeInTheDocument();
    expect(screen.getByText(/providerQuotaResetsAt/)).toBeInTheDocument();
    const meter = screen.getByRole("progressbar", { name: "providerQuotaWindow.primary" });
    expect(meter).toHaveAttribute("aria-valuenow", "75");
    expect(meter.firstElementChild).toHaveStyle({ width: "75%" });
    expect(providerQuotaMock).toHaveBeenCalledWith("instance-1", "codex-a.json");
  });

  it("零剩余额度显示空进度条，未知额度不画误导性进度条", () => {
    providerQuotaMock.mockReturnValue({
      data: {
        provider: "codex",
        status: "ready",
        reason: null,
        fetched_at: "2026-09-23T00:00:00Z",
        windows: [
          { id: "primary", remaining_percent: 0, resets_at: null },
          { id: "secondary", remaining_percent: null, resets_at: null },
        ],
      },
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    render(
      <CliproxyAccountDetailDialog
        instanceId="instance-1"
        account={account}
        open
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByRole("progressbar", { name: "providerQuotaWindow.primary" })
    ).toHaveAttribute("aria-valuenow", "0");
    expect(screen.queryByRole("progressbar", { name: "providerQuotaWindow.secondary" })).toBeNull();
  });

  it("停用账号不触发额度查询且显示原因", () => {
    render(
      <CliproxyAccountDetailDialog
        instanceId="instance-1"
        account={{ ...account, disabled: true }}
        open
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("providerQuotaDisabled")).toBeInTheDocument();
    expect(providerQuotaMock).toHaveBeenCalledWith("instance-1", null);
  });

  it("Claude 账号显示七天窗口，额度失败显示重试入口", () => {
    providerQuotaMock.mockReturnValueOnce({
      data: {
        provider: "anthropic",
        status: "ready",
        reason: null,
        fetched_at: "2026-09-23T00:00:00Z",
        windows: [{ id: "seven-day", remaining_percent: 42, resets_at: null }],
      },
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    const view = render(
      <CliproxyAccountDetailDialog
        instanceId="instance-1"
        account={{ ...account, provider: "anthropic" }}
        open
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByRole("progressbar", { name: "providerQuotaWindow.seven-day" })
    ).toHaveAttribute("aria-valuenow", "42");
    view.unmount();

    providerQuotaMock.mockReturnValueOnce({
      data: null,
      isPending: false,
      isError: true,
      isFetching: false,
      refetch: vi.fn(),
    });
    render(
      <CliproxyAccountDetailDialog
        instanceId="instance-1"
        account={{ ...account, provider: "anthropic" }}
        open
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("providerQuotaFailed");
    expect(screen.getByRole("button", { name: "providerQuotaRefresh" })).toBeEnabled();
  });
});
