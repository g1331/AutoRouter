import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const uploadMutateAsync = vi.fn();
const toastError = vi.fn();

vi.mock("@/hooks/use-cliproxy", () => ({
  useUploadCliproxyAuthFile: () => ({
    mutateAsync: uploadMutateAsync,
    isPending: false,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: (message: string) => toastError(message) },
}));

import { CliproxyAuthFileUploadDialog } from "@/components/admin/cliproxy-auth-file-upload-dialog";

describe("CliproxyAuthFileUploadDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("默认展示选择文件模式", () => {
    render(<CliproxyAuthFileUploadDialog instanceId="instance-1" open onClose={vi.fn()} />);
    expect(screen.getByText("uploadAuthFileChoose")).toBeInTheDocument();
  });

  it("切换到粘贴模式后展示文本框", () => {
    render(<CliproxyAuthFileUploadDialog instanceId="instance-1" open onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("uploadAuthFileMethodPaste"));
    expect(screen.getByPlaceholderText("uploadAuthFilePastePlaceholder")).toBeInTheDocument();
  });

  it("粘贴非 JSON 提交时触发错误提示", async () => {
    render(<CliproxyAuthFileUploadDialog instanceId="instance-1" open onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("uploadAuthFileMethodPaste"));
    fireEvent.change(screen.getByPlaceholderText("uploadAuthFilePastePlaceholder"), {
      target: { value: "not-json" },
    });
    fireEvent.click(screen.getByText("uploadAuthFileSubmit"));

    expect(toastError).toHaveBeenCalledWith("uploadAuthFileInvalidJson");
    expect(uploadMutateAsync).not.toHaveBeenCalled();
  });

  it("空内容提交时触发空提示", async () => {
    render(<CliproxyAuthFileUploadDialog instanceId="instance-1" open onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("uploadAuthFileMethodPaste"));
    fireEvent.click(screen.getByText("uploadAuthFileSubmit"));

    expect(toastError).toHaveBeenCalledWith("uploadAuthFileEmpty");
    expect(uploadMutateAsync).not.toHaveBeenCalled();
  });

  it("合法 JSON 提交时调用上传 mutation", async () => {
    uploadMutateAsync.mockResolvedValueOnce({ added: 1, updated: 0, removed: 0, total: 1 });
    const onClose = vi.fn();
    render(<CliproxyAuthFileUploadDialog instanceId="instance-1" open onClose={onClose} />);
    fireEvent.click(screen.getByText("uploadAuthFileMethodPaste"));
    fireEvent.change(screen.getByPlaceholderText("uploadAuthFilePastePlaceholder"), {
      target: { value: '{"token":"abc"}' },
    });
    fireEvent.click(screen.getByText("uploadAuthFileSubmit"));

    // 异步等待 mutation 完成
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(uploadMutateAsync).toHaveBeenCalledWith({
      instanceId: "instance-1",
      content: { token: "abc" },
    });
  });
});
