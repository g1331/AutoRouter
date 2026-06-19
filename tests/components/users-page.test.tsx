import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import UsersPage from "@/app/[locale]/(dashboard)/system/users/page";
import type { PaginatedUsersResponse, User } from "@/types/api";

// next-intl：翻译键透传
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// i18n 路由：捕获导航目标，供查看使用量入口断言
const routerPush = vi.hoisted(() => vi.fn());
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

// useUsers：返回值可在用例间切换（加载态 / 数据态）
const usersState = vi.hoisted(() => ({
  current: { data: undefined, isLoading: true } as {
    data: PaginatedUsersResponse | undefined;
    isLoading: boolean;
  },
}));
vi.mock("@/hooks/use-users", () => ({
  useUsers: () => usersState.current,
}));

// useAuth：默认账号登录的管理员（不豁免），用例可切换为 ADMIN_TOKEN
const authState = vi.hoisted(() => ({
  current: { principal: { kind: "user", role: "admin" } } as {
    principal: { kind: string; role?: string } | null;
  },
}));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => authState.current,
}));

// 顶栏：仅回显标题
vi.mock("@/components/admin/topbar", () => ({
  Topbar: ({ title }: { title: string }) => <div data-testid="topbar">{title}</div>,
}));

// 用户表格：捕获页面传入的 props，断言 activeAdminCount 计算
const tableProps = vi.hoisted(() => ({
  current: undefined as
    | {
        users: User[];
        activeAdminCount: number;
        bypassLastAdminGuard?: boolean;
        onViewUsage: (user: User) => void;
      }
    | undefined,
}));
vi.mock("@/components/admin/users-table", () => ({
  UsersTable: (props: {
    users: User[];
    activeAdminCount: number;
    bypassLastAdminGuard?: boolean;
    onViewUsage: (user: User) => void;
  }) => {
    tableProps.current = props;
    return <div data-testid="users-table" />;
  },
}));

// 其余子组件桩为空占位，避免无关渲染副作用
vi.mock("@/components/admin/create-user-dialog", () => ({
  CreateUserDialog: () => <div data-testid="create-user-dialog" />,
}));
vi.mock("@/components/admin/pagination-controls", () => ({
  PaginationControls: () => <div data-testid="pagination" />,
}));
vi.mock("@/components/admin/edit-user-dialog", () => ({ EditUserDialog: () => null }));
vi.mock("@/components/admin/change-username-dialog", () => ({ ChangeUsernameDialog: () => null }));
vi.mock("@/components/admin/reset-password-dialog", () => ({ ResetPasswordDialog: () => null }));
vi.mock("@/components/admin/user-upstreams-dialog", () => ({ UserUpstreamsDialog: () => null }));
vi.mock("@/components/admin/assign-user-keys-dialog", () => ({ AssignUserKeysDialog: () => null }));
vi.mock("@/components/admin/delete-user-dialog", () => ({ DeleteUserDialog: () => null }));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function makeUser(overrides: Partial<User>): User {
  return {
    id: "u1",
    username: "alice",
    display_name: "Alice",
    role: "member",
    is_active: true,
    api_key_count: 0,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usersState.current = { data: undefined, isLoading: true };
  authState.current = { principal: { kind: "user", role: "admin" } };
  tableProps.current = undefined;
  routerPush.mockClear();
});

describe("UsersPage", () => {
  it("加载态展示加载占位且不渲染表格", () => {
    usersState.current = { data: undefined, isLoading: true };
    render(<UsersPage />);

    expect(screen.getByRole("status")).toHaveTextContent("loading");
    expect(screen.queryByTestId("users-table")).not.toBeInTheDocument();
  });

  it("渲染标题、新建入口并向表格传入启用管理员数量", () => {
    usersState.current = {
      data: {
        items: [
          makeUser({ id: "a1", username: "root", role: "admin", is_active: true }),
          makeUser({ id: "a2", username: "ex", role: "admin", is_active: false }),
          makeUser({ id: "m1", username: "alice", role: "member", is_active: true }),
        ],
        total: 3,
        page: 1,
        page_size: 10,
        total_pages: 1,
        active_admin_total: 1,
      },
      isLoading: false,
    };
    render(<UsersPage />);

    expect(screen.getByTestId("topbar")).toHaveTextContent("pageTitle");
    expect(screen.getByTestId("create-user-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("users-table")).toBeInTheDocument();
    expect(tableProps.current?.users).toHaveLength(3);
    // 仅统计启用状态的管理员，停用管理员不计入
    expect(tableProps.current?.activeAdminCount).toBe(1);
    // 账号登录的管理员不豁免最后一个启用管理员守卫
    expect(tableProps.current?.bypassLastAdminGuard).toBe(false);
  });

  it("ADMIN_TOKEN 登录时向表格传入豁免标志", () => {
    authState.current = { principal: { kind: "admin_token" } };
    usersState.current = {
      data: {
        items: [makeUser({ id: "a1", username: "root", role: "admin", is_active: true })],
        total: 1,
        page: 1,
        page_size: 10,
        total_pages: 1,
        active_admin_total: 1,
      },
      isLoading: false,
    };
    render(<UsersPage />);

    expect(tableProps.current?.bypassLastAdminGuard).toBe(true);
  });

  it("查看使用量入口导航到对应用户详情页", () => {
    usersState.current = {
      data: {
        items: [makeUser({ id: "u9", username: "alice", role: "member", is_active: true })],
        total: 1,
        page: 1,
        page_size: 10,
        total_pages: 1,
        active_admin_total: 0,
      },
      isLoading: false,
    };
    render(<UsersPage />);

    tableProps.current?.onViewUsage(makeUser({ id: "u9" }));
    expect(routerPush).toHaveBeenCalledWith("/system/users/u9");
  });
});
