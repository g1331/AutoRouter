import type { ReactNode } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UsersTable } from "@/components/admin/users-table";
import type { User } from "@/types/api";

// next-intl：翻译键透传，避免依赖具体文案
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// 切换启用状态的 mutation 桩：默认成功，未处于 pending
const toggleMock = vi.hoisted(() => ({
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
  variables: undefined as unknown,
}));
vi.mock("@/hooks/use-users", () => ({
  useToggleUserActive: () => toggleMock,
}));

// date-fns 语言包：返回 undefined 走默认 en，避免引入区域副作用
vi.mock("@/lib/date-locale", () => ({ getDateLocale: () => undefined }));

// 下拉菜单：直接把菜单项渲染为按钮，便于断言 disabled 与触发回调
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

// 开关：渲染为带 aria 状态的按钮，便于读取 disabled / checked
vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    disabled,
    "aria-label": ariaLabel,
  }: {
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
    disabled?: boolean;
    "aria-label"?: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}));

function makeUser(overrides: Partial<User>): User {
  return {
    id: "u1",
    username: "alice",
    display_name: "Alice Zhang",
    role: "member",
    is_active: true,
    api_key_count: 2,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const handlers = {
  onEdit: vi.fn(),
  onChangeUsername: vi.fn(),
  onResetPassword: vi.fn(),
  onConfigureUpstreams: vi.fn(),
  onAssignKeys: vi.fn(),
  onDelete: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UsersTable", () => {
  it("渲染用户行的账号信息", () => {
    render(<UsersTable users={[makeUser({})]} activeAdminCount={0} {...handlers} />);

    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("Alice Zhang")).toBeInTheDocument();
    expect(screen.getByText("roleMember")).toBeInTheDocument();
  });

  it("空列表展示占位提示", () => {
    render(<UsersTable users={[]} activeAdminCount={0} {...handlers} />);

    expect(screen.getByText("noUsers")).toBeInTheDocument();
  });

  it("最后一个启用管理员禁用停用开关与删除入口", () => {
    const admin = makeUser({ id: "a1", username: "root", role: "admin", is_active: true });
    render(<UsersTable users={[admin]} activeAdminCount={1} {...handlers} />);

    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByRole("button", { name: "deleteUser" })).toBeDisabled();
  });

  it("存在多个启用管理员时不禁用危险操作", () => {
    const admin = makeUser({ id: "a1", username: "root", role: "admin", is_active: true });
    render(<UsersTable users={[admin]} activeAdminCount={2} {...handlers} />);

    expect(screen.getByRole("switch")).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "deleteUser" })).not.toBeDisabled();
  });

  it("ADMIN_TOKEN 豁免时即便是最后一个启用管理员也不禁用危险操作", () => {
    const admin = makeUser({ id: "a1", username: "root", role: "admin", is_active: true });
    render(<UsersTable users={[admin]} activeAdminCount={1} bypassLastAdminGuard {...handlers} />);

    expect(screen.getByRole("switch")).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "deleteUser" })).not.toBeDisabled();
  });

  it("点击编辑与删除触发对应回调", () => {
    const user = makeUser({});
    render(<UsersTable users={[user]} activeAdminCount={0} {...handlers} />);

    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    expect(handlers.onEdit).toHaveBeenCalledWith(user);

    fireEvent.click(screen.getByRole("button", { name: "deleteUser" }));
    expect(handlers.onDelete).toHaveBeenCalledWith(user);
  });
});
