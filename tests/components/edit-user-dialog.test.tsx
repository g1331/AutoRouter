import type { ReactNode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditUserDialog } from "@/components/admin/edit-user-dialog";
import type { User } from "@/types/api";

// next-intl：翻译键透传
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// 更新用户 mutation 桩
const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }));
vi.mock("@/hooks/use-users", () => ({
  useUpdateUser: () => ({ mutateAsync: updateMock, isPending: false }),
}));

// 对话框：始终展开渲染内容，免去 radix 触发与 portal 交互
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// 角色选择：用真实的原生 select 暴露 role 值，便于切换到 admin 后断言开关消失
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (next: string) => void;
  }) => (
    <select aria-label="role" value={value} onChange={(event) => onValueChange(event.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    username: "alice",
    display_name: "Alice",
    role: "member",
    is_active: true,
    expose_upstreams: false,
    api_key_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EditUserDialog — 上游可见性", () => {
  it("成员默认关闭开关，并把当前值回填", () => {
    render(<EditUserDialog user={makeUser()} open onOpenChange={vi.fn()} />);

    const toggle = screen.getByRole("switch", { name: "exposeUpstreams" });
    expect(toggle).toHaveAttribute("data-state", "unchecked");
    expect(screen.getByText("exposeUpstreamsDesc")).toBeInTheDocument();
  });

  it("已开启可见性的成员回填为开启", () => {
    render(
      <EditUserDialog user={makeUser({ expose_upstreams: true })} open onOpenChange={vi.fn()} />
    );

    expect(screen.getByRole("switch", { name: "exposeUpstreams" })).toHaveAttribute(
      "data-state",
      "checked"
    );
  });

  it("打开开关后提交，载荷带上 expose_upstreams", async () => {
    updateMock.mockResolvedValueOnce({ id: "u1" });
    const onOpenChange = vi.fn();
    render(<EditUserDialog user={makeUser()} open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("switch", { name: "exposeUpstreams" }));
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        id: "u1",
        data: {
          display_name: "Alice",
          role: "member",
          is_active: true,
          expose_upstreams: true,
        },
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // 可见性只作用于成员端点，管理员始终能看到全部上游，开关对其无意义。
  it("角色切到管理员后隐藏该开关", () => {
    render(<EditUserDialog user={makeUser()} open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("role"), { target: { value: "admin" } });

    expect(screen.queryByRole("switch", { name: "exposeUpstreams" })).not.toBeInTheDocument();
  });

  it("管理员用户打开对话框时不渲染该开关", () => {
    render(<EditUserDialog user={makeUser({ role: "admin" })} open onOpenChange={vi.fn()} />);

    expect(screen.queryByRole("switch", { name: "exposeUpstreams" })).not.toBeInTheDocument();
  });
});
