import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const downloadMutate = vi.fn();
const statusMutate = vi.fn();
const syncMutate = vi.fn();
const useCliproxyAuthAccountsMock = vi.fn();

vi.mock("@/hooks/use-cliproxy", () => ({
  useCliproxyAuthAccounts: (...args: unknown[]) => useCliproxyAuthAccountsMock(...args),
  useSyncCliproxyAuthAccounts: () => ({ mutate: syncMutate, isPending: false }),
  useSetCliproxyAuthAccountStatus: () => ({ mutate: statusMutate, isPending: false }),
  useDownloadCliproxyAuthFile: () => ({ mutate: downloadMutate, isPending: false }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/admin/cliproxy-accounts-table", () => ({
  CliproxyAccountsTable: (props: Record<string, unknown>) => {
    const firstAccount = (props.accounts as Array<unknown>)[0];
    return (
      <div data-testid="accounts-table">
        <button onClick={() => (props.onDownload as (a: unknown) => void)(firstAccount)}>
          trigger-download
        </button>
        <button onClick={() => (props.onDelete as (a: unknown) => void)(firstAccount)}>
          trigger-delete
        </button>
        <button onClick={() => (props.onToggleStatus as (a: unknown) => void)(firstAccount)}>
          trigger-toggle
        </button>
      </div>
    );
  },
}));

vi.mock("@/components/admin/cliproxy-account-fields-dialog", () => ({
  CliproxyAccountFieldsDialog: () => <div data-testid="fields-dialog" />,
}));

vi.mock("@/components/admin/cliproxy-account-detail-dialog", () => ({
  CliproxyAccountDetailDialog: () => <div data-testid="detail-dialog" />,
}));

vi.mock("@/components/admin/cliproxy-account-models-dialog", () => ({
  CliproxyAccountModelsDialog: () => <div data-testid="models-dialog" />,
}));

vi.mock("@/components/admin/cliproxy-oauth-login-dialog", () => ({
  CliproxyOAuthLoginDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="oauth-dialog">
      <button onClick={onClose}>oauth-close</button>
    </div>
  ),
}));

vi.mock("@/components/admin/cliproxy-account-upstream-dialog", () => ({
  CliproxyAccountUpstreamDialog: () => <div data-testid="upstream-dialog" />,
}));

vi.mock("@/components/admin/cliproxy-auth-file-upload-dialog", () => ({
  CliproxyAuthFileUploadDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="upload-dialog">
      <button onClick={onClose}>upload-close</button>
    </div>
  ),
}));

vi.mock("@/components/admin/cliproxy-delete-auth-file-dialog", () => ({
  CliproxyDeleteAuthFileDialog: ({ account }: { account: unknown }) =>
    account ? <div data-testid="delete-dialog" /> : null,
}));

import { CliproxyAccountsPanel } from "@/components/admin/cliproxy-accounts-panel";
import type { CliproxyAuthAccount, CliproxyInstance } from "@/types/cliproxy";

const instance: CliproxyInstance = {
  id: "instance-1",
  name: "local-dev",
  mode: "managed",
  base_url: "http://cliproxyapi:8317",
  management_url: "http://cliproxyapi:8317",
  has_client_api_key: true,
  has_management_key: true,
  enabled: true,
  description: null,
  created_at: "2026-05-30T12:00:00.000Z",
  updated_at: "2026-05-30T12:00:00.000Z",
};

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

describe("CliproxyAccountsPanel 集成行为", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCliproxyAuthAccountsMock.mockReturnValue({
      data: [account],
      isLoading: false,
      isError: false,
    });
  });

  it("加载中时展示骨架占位", () => {
    useCliproxyAuthAccountsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    render(<CliproxyAccountsPanel instance={instance} />);
    expect(screen.queryByTestId("accounts-table")).not.toBeInTheDocument();
  });

  it("加载失败时展示错误文案", () => {
    useCliproxyAuthAccountsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<CliproxyAccountsPanel instance={instance} />);
    expect(screen.getByText("accountsLoadFailed")).toBeInTheDocument();
  });

  it("空账号列表时展示 noAccounts", () => {
    useCliproxyAuthAccountsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    render(<CliproxyAccountsPanel instance={instance} />);
    expect(screen.getByText("noAccounts")).toBeInTheDocument();
  });

  it("点击同步按钮触发 syncMutation.mutate", () => {
    render(<CliproxyAccountsPanel instance={instance} />);
    fireEvent.click(screen.getByText("syncAccounts"));
    expect(syncMutate).toHaveBeenCalledWith("instance-1");
  });

  it("点击 OAuth 登录按钮打开登录弹窗，关闭弹窗回到收起态", () => {
    render(<CliproxyAccountsPanel instance={instance} />);
    expect(screen.queryByTestId("oauth-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("oauthLogin"));
    expect(screen.getByTestId("oauth-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByText("oauth-close"));
    expect(screen.queryByTestId("oauth-dialog")).not.toBeInTheDocument();
  });

  it("点击上传按钮打开上传弹窗，关闭弹窗回到收起态", () => {
    render(<CliproxyAccountsPanel instance={instance} />);
    expect(screen.queryByTestId("upload-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("uploadAuthFile"));
    expect(screen.getByTestId("upload-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByText("upload-close"));
    expect(screen.queryByTestId("upload-dialog")).not.toBeInTheDocument();
  });

  it("子表格触发 onDelete 时弹出删除弹窗", () => {
    render(<CliproxyAccountsPanel instance={instance} />);
    expect(screen.queryByTestId("delete-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("trigger-delete"));
    expect(screen.getByTestId("delete-dialog")).toBeInTheDocument();
  });

  it("子表格触发 onDownload 时调用下载 mutation 并传入实例与文件名", () => {
    render(<CliproxyAccountsPanel instance={instance} />);
    fireEvent.click(screen.getByText("trigger-download"));
    expect(downloadMutate).toHaveBeenCalledWith({
      instanceId: "instance-1",
      authFileName: "codex-a.json",
    });
  });

  it("子表格触发 onToggleStatus 时调用启停 mutation 且 disabled 取反", () => {
    render(<CliproxyAccountsPanel instance={instance} />);
    fireEvent.click(screen.getByText("trigger-toggle"));
    expect(statusMutate).toHaveBeenCalledWith({
      instanceId: "instance-1",
      accountName: "codex-a.json",
      disabled: true,
    });
  });
});
