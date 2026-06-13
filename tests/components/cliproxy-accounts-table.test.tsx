import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/ui/dropdown-menu", () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    DropdownMenu: Passthrough,
    DropdownMenuTrigger: Passthrough,
    DropdownMenuContent: Passthrough,
    DropdownMenuItem: ({
      children,
      onClick,
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      className?: string;
    }) => (
      <button type="button" onClick={onClick} data-testid="menu-item">
        {children}
      </button>
    ),
  };
});

import { CliproxyAccountsTable } from "@/components/admin/cliproxy-accounts-table";
import type { CliproxyAuthAccount } from "@/types/cliproxy";

const baseAccount: CliproxyAuthAccount = {
  id: "acc-1",
  instance_id: "instance-1",
  auth_file_name: "codex-a.json",
  provider: "codex",
  email: "alice@example.com",
  status: "active",
  disabled: false,
  prefix: "team-a",
  model_count: 3,
  priority: 0,
  note: null,
  raw_metadata: null,
  last_synced_at: "2026-05-30T12:00:00.000Z",
  created_at: "2026-05-30T12:00:00.000Z",
  updated_at: "2026-05-30T12:00:00.000Z",
};

function setup(overrides: Partial<CliproxyAuthAccount> = {}) {
  const handlers = {
    onToggleStatus: vi.fn(),
    onEditFields: vi.fn(),
    onMapUpstream: vi.fn(),
    onViewDetail: vi.fn(),
    onViewModels: vi.fn(),
    onDownload: vi.fn(),
    onDelete: vi.fn(),
  };
  render(<CliproxyAccountsTable accounts={[{ ...baseAccount, ...overrides }]} {...handlers} />);
  return handlers;
}

describe("CliproxyAccountsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("渲染邮箱、模型数、前缀等关键字段", () => {
    setup();
    expect(screen.getByText("codex-a.json")).toBeInTheDocument();
    expect(screen.getByText("codex")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("team-a")).toBeInTheDocument();
  });

  it("无邮箱时展示占位符", () => {
    setup({ email: null });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("无前缀时展示 prefixUnset 文案", () => {
    setup({ prefix: null });
    expect(screen.getByText("prefixUnset")).toBeInTheDocument();
  });

  it("点击模型数按钮调用 onViewModels", () => {
    const { onViewModels } = setup();
    fireEvent.click(screen.getByText("3"));
    expect(onViewModels).toHaveBeenCalledTimes(1);
  });

  it("操作菜单 7 个项各自触发对应回调", () => {
    const handlers = setup();

    fireEvent.click(screen.getByText("actionViewDetail"));
    expect(handlers.onViewDetail).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("actionViewModels"));
    expect(handlers.onViewModels).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("actionDisable"));
    expect(handlers.onToggleStatus).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("actionEditFields"));
    expect(handlers.onEditFields).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("actionMapUpstream"));
    expect(handlers.onMapUpstream).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("actionDownload"));
    expect(handlers.onDownload).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("actionDelete"));
    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
  });

  it("查看详情 / 编辑字段 / 删除回调附带行元素作为容器变形源", () => {
    const handlers = setup();

    fireEvent.click(screen.getByText("actionViewDetail"));
    fireEvent.click(screen.getByText("actionEditFields"));
    fireEvent.click(screen.getByText("actionDelete"));

    for (const handler of [handlers.onViewDetail, handlers.onEditFields, handlers.onDelete]) {
      expect(handler).toHaveBeenCalledWith(expect.anything(), expect.any(HTMLElement));
      const source = handler.mock.calls[0][1] as HTMLElement;
      expect(source.hasAttribute("data-morph-source")).toBe(true);
    }
  });

  it("禁用状态下菜单展示 actionEnable", () => {
    setup({ disabled: true });
    expect(screen.getByText("actionEnable")).toBeInTheDocument();
  });

  it("启用状态下展示成功色 Badge 与 accountStatusEnabled", () => {
    setup({ disabled: false });
    expect(screen.getByText("accountStatusEnabled")).toBeInTheDocument();
  });
});
