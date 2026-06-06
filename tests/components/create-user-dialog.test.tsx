import type { ReactNode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateUserDialog } from "@/components/admin/create-user-dialog";

// next-intl：翻译键透传
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// 创建用户 mutation 桩
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("@/hooks/use-users", () => ({
  useCreateUser: () => ({ mutateAsync: createMock, isPending: false }),
}));

// 对话框：始终展开渲染内容，免去 radix 触发与 portal 交互
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// 角色选择：role 字段不参与本测试交互，简化渲染保留默认 member
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: () => <span />,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreateUserDialog", () => {
  it("填写表单并提交时以新建载荷调用创建", async () => {
    createMock.mockResolvedValueOnce({ id: "u1" });
    render(<CreateUserDialog />);

    fireEvent.change(screen.getByPlaceholderText("usernamePlaceholder"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByPlaceholderText("displayNamePlaceholder"), {
      target: { value: "Alice" },
    });
    fireEvent.change(screen.getByPlaceholderText("passwordPlaceholder"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({
        username: "alice",
        display_name: "Alice",
        password: "secret123",
        role: "member",
      })
    );
  });

  it("缺少必填项时阻止提交并提示校验错误", async () => {
    render(<CreateUserDialog />);

    fireEvent.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() => expect(screen.getByText("usernameRequired")).toBeInTheDocument());
    expect(createMock).not.toHaveBeenCalled();
  });
});
