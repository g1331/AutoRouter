import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const initiateMutateAsync = vi.fn();
const submitCallbackMutateAsync = vi.fn();
const useCliproxyOAuthStatusMock = vi.fn();

vi.mock("@/hooks/use-cliproxy", () => ({
  CLIPROXY_OAUTH_POLL_TIMEOUT_MS: 300000,
  useInitiateCliproxyOAuthLogin: () => ({
    mutateAsync: initiateMutateAsync,
    isPending: false,
  }),
  useCliproxyOAuthStatus: (...args: unknown[]) => useCliproxyOAuthStatusMock(...args),
  useSubmitCliproxyOAuthCallback: () => ({
    mutateAsync: submitCallbackMutateAsync,
    isPending: false,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { CliproxyOAuthLoginDialog } from "@/components/admin/cliproxy-oauth-login-dialog";

describe("CliproxyOAuthLoginDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCliproxyOAuthStatusMock.mockReturnValue({ data: undefined });
  });

  it("初始渲染展示标题与发起登录按钮", () => {
    render(<CliproxyOAuthLoginDialog instanceId="instance-1" open onClose={vi.fn()} />);
    expect(screen.getByText("oauthLoginTitle")).toBeInTheDocument();
    expect(screen.getByText("oauthStartLogin")).toBeInTheDocument();
  });

  it("发起登录成功后展示授权地址", async () => {
    initiateMutateAsync.mockResolvedValueOnce({
      provider: "codex",
      url: "https://auth.example/login",
      state: "state-1",
    });
    render(<CliproxyOAuthLoginDialog instanceId="instance-1" open onClose={vi.fn()} />);

    fireEvent.click(screen.getByText("oauthStartLogin"));

    expect(await screen.findByText("https://auth.example/login")).toBeInTheDocument();
    expect(initiateMutateAsync).toHaveBeenCalledWith({
      instanceId: "instance-1",
      provider: "codex",
    });
  });

  it("点击关闭调用 onClose", () => {
    const onClose = vi.fn();
    render(<CliproxyOAuthLoginDialog instanceId="instance-1" open onClose={onClose} />);
    fireEvent.click(screen.getByText("close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("登录失败时展示手动回调输入框，提交回调成功后关闭弹窗", async () => {
    initiateMutateAsync.mockResolvedValueOnce({
      provider: "codex",
      url: "https://auth.example/login",
      state: "state-1",
    });
    useCliproxyOAuthStatusMock.mockReturnValue({
      data: { status: "error", error: "auto callback unreachable" },
    });
    submitCallbackMutateAsync.mockResolvedValueOnce({ status: "ok" });
    const onClose = vi.fn();
    render(<CliproxyOAuthLoginDialog instanceId="instance-1" open onClose={onClose} />);

    fireEvent.click(screen.getByText("oauthStartLogin"));
    await screen.findByText("oauthManualCallback");

    const input = screen.getByPlaceholderText("oauthManualCallbackPlaceholder");
    fireEvent.change(input, {
      target: { value: "https://callback.example/auth?code=abc&state=state-1" },
    });
    fireEvent.click(screen.getByText("oauthManualCallbackSubmit"));

    await waitFor(() =>
      expect(submitCallbackMutateAsync).toHaveBeenCalledWith({
        instanceId: "instance-1",
        provider: "codex",
        redirectUrl: "https://callback.example/auth?code=abc&state=state-1",
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("手动回调输入为空时不发起提交", async () => {
    initiateMutateAsync.mockResolvedValueOnce({
      provider: "codex",
      url: "https://auth.example/login",
      state: "state-1",
    });
    useCliproxyOAuthStatusMock.mockReturnValue({
      data: { status: "error" },
    });
    render(<CliproxyOAuthLoginDialog instanceId="instance-1" open onClose={vi.fn()} />);

    fireEvent.click(screen.getByText("oauthStartLogin"));
    await screen.findByText("oauthManualCallback");

    fireEvent.click(screen.getByText("oauthManualCallbackSubmit"));
    expect(submitCallbackMutateAsync).not.toHaveBeenCalled();
  });
});
