import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const deleteMutateAsync = vi.fn();

vi.mock("@/hooks/use-cliproxy", () => ({
  useDeleteCliproxyAuthFile: () => ({
    mutateAsync: deleteMutateAsync,
    isPending: false,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { CliproxyDeleteAuthFileDialog } from "@/components/admin/cliproxy-delete-auth-file-dialog";
import type { CliproxyAuthAccount } from "@/types/cliproxy";

const account: CliproxyAuthAccount = {
  id: "acc-1",
  instance_id: "instance-1",
  auth_file_name: "codex-a.json",
  provider: "codex",
  email: null,
  status: null,
  disabled: false,
  prefix: null,
  model_count: 0,
  priority: null,
  note: null,
  raw_metadata: null,
  last_synced_at: null,
  created_at: "2026-05-30T12:00:00.000Z",
  updated_at: "2026-05-30T12:00:00.000Z",
};

describe("CliproxyDeleteAuthFileDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("展示要删除的认证文件名", () => {
    render(
      <CliproxyDeleteAuthFileDialog instanceId="instance-1" account={account} onClose={vi.fn()} />
    );
    expect(screen.getByText("codex-a.json")).toBeInTheDocument();
    expect(screen.getByText("deleteAuthFileTitle")).toBeInTheDocument();
  });

  it("点击删除按钮调用 mutation 并关闭弹窗", async () => {
    deleteMutateAsync.mockResolvedValueOnce({ name: "codex-a.json" });
    const onClose = vi.fn();
    render(
      <CliproxyDeleteAuthFileDialog instanceId="instance-1" account={account} onClose={onClose} />
    );

    fireEvent.click(screen.getByText("delete"));

    await waitFor(() =>
      expect(deleteMutateAsync).toHaveBeenCalledWith({
        instanceId: "instance-1",
        authFileName: "codex-a.json",
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("删除失败时不抛出且仍保持弹窗（关闭交由错误提示之外的路径）", async () => {
    deleteMutateAsync.mockRejectedValueOnce(new Error("upstream unreachable"));
    const onClose = vi.fn();
    render(
      <CliproxyDeleteAuthFileDialog instanceId="instance-1" account={account} onClose={onClose} />
    );

    fireEvent.click(screen.getByText("delete"));

    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("account 为 null 时不渲染对话框内容", () => {
    render(
      <CliproxyDeleteAuthFileDialog instanceId="instance-1" account={null} onClose={vi.fn()} />
    );
    expect(screen.queryByText("deleteAuthFileTitle")).not.toBeInTheDocument();
  });

  it("点击取消调用 onClose", () => {
    const onClose = vi.fn();
    render(
      <CliproxyDeleteAuthFileDialog instanceId="instance-1" account={account} onClose={onClose} />
    );
    fireEvent.click(screen.getByText("cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
