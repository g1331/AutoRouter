import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import AdminUserUsagePage from "@/app/[locale]/(dashboard)/system/users/[id]/page";
import { ApiError } from "@/lib/api";
import type { PortalOverviewResponse, PortalUsageResponse, User } from "@/types/api";

// next-intl：翻译键透传（带命名空间前缀），便于断言取用的 key
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) =>
    `${namespace ? `${namespace}.` : ""}${key}${values ? `(${JSON.stringify(values)})` : ""}`,
}));

// 路由参数：固定目标用户 id
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "u1" }),
}));

// i18n 链接：渲染为带 href 的锚点，捕获跳转目标
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: unknown; children: ReactNode }) => (
    <a data-href={typeof href === "string" ? href : JSON.stringify(href)}>{children}</a>
  ),
}));

// 顶栏：仅回显标题
vi.mock("@/components/admin/topbar", () => ({
  Topbar: ({ title }: { title: string }) => <header data-testid="topbar">{title}</header>,
}));

// 用量趋势图：回显当前 range，避免渲染 recharts
vi.mock("@/components/portal/portal-usage-chart", () => ({
  PortalUsageChart: ({ range }: { range: string }) => (
    <div data-testid="usage-chart" data-range={range} />
  ),
}));

const userState = vi.hoisted(() => ({
  current: { data: undefined, isLoading: true, error: null } as {
    data: User | undefined;
    isLoading: boolean;
    error: unknown;
  },
}));
const overviewState = vi.hoisted(() => ({
  current: { data: undefined, isLoading: true } as {
    data: PortalOverviewResponse | undefined;
    isLoading: boolean;
  },
}));
const usageState = vi.hoisted(() => ({
  current: { data: undefined, isLoading: true } as {
    data: PortalUsageResponse | undefined;
    isLoading: boolean;
  },
}));

vi.mock("@/hooks/use-admin-user-stats", () => ({
  useAdminUser: () => userState.current,
  useAdminUserOverview: () => overviewState.current,
  useAdminUserUsage: () => usageState.current,
}));

function makeUser(overrides: Partial<User> = {}): User {
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

const overview: PortalOverviewResponse = {
  today_requests: 12,
  month_requests: 340,
  month_cost_usd: 1.25,
  total_requests: 9000,
  total_cost_usd: 25.5,
  active_key_count: 2,
  total_key_count: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  userState.current = { data: undefined, isLoading: true, error: null };
  overviewState.current = { data: undefined, isLoading: true };
  usageState.current = { data: undefined, isLoading: true };
});

describe("AdminUserUsagePage", () => {
  it("加载用户时展示返回入口且不渲染未找到态", () => {
    render(<AdminUserUsagePage />);

    expect(screen.getByText("users.backToUsers")).toBeInTheDocument();
    expect(screen.queryByText("users.userNotFound")).not.toBeInTheDocument();
  });

  it("用户加载完成后渲染身份信息、概览数字与趋势图", () => {
    userState.current = { data: makeUser(), isLoading: false, error: null };
    overviewState.current = { data: overview, isLoading: false };
    usageState.current = {
      data: { range: "7d", granularity: "day", points: [] },
      isLoading: false,
    };

    render(<AdminUserUsagePage />);

    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("Alice Zhang")).toBeInTheDocument();
    expect(screen.getByText("users.roleMember")).toBeInTheDocument();
    expect(screen.getByText("users.active")).toBeInTheDocument();

    // 概览卡片复用门户文案与格式化（今日请求 12、本月请求 340、本月花费 $1.25）
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("340")).toBeInTheDocument();
    expect(screen.getByText("$1.25")).toBeInTheDocument();

    expect(screen.getByTestId("usage-chart")).toHaveAttribute("data-range", "7d");

    // 查看该用户日志链接携带 user_id 过滤参数
    const logsLink = screen.getByText("users.viewUserLogs").closest("a");
    expect(logsLink?.getAttribute("data-href")).toContain("u1");
    expect(logsLink?.getAttribute("data-href")).toContain("user_id");
  });

  it("用户不存在（404）时展示未找到态且不渲染概览与趋势图", () => {
    userState.current = {
      data: undefined,
      isLoading: false,
      error: new ApiError("User not found", 404),
    };

    render(<AdminUserUsagePage />);

    expect(screen.getByText("users.userNotFound")).toBeInTheDocument();
    expect(screen.queryByTestId("usage-chart")).not.toBeInTheDocument();
    expect(screen.queryByText("alice")).not.toBeInTheDocument();
  });
});
