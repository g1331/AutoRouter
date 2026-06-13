import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PortalLayout from "@/app/[locale]/(portal)/layout";

// 门户布局守卫（决策九）：门户仅面向 member，admin 与管理员令牌身份
// 没有个人数据作用域，访问门户时应被送回管理后台。AppShell 自身的
// token 守卫与壳层行为已在 tests/components/app-shell.test.tsx 覆盖，
// 这里桩为透传容器，聚焦角色分流逻辑。

const mockReplace = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const authState = vi.hoisted(() => ({
  principal: null as { kind: string; role: "admin" | "member" } | null,
}));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    token: "test-token",
    principal: authState.principal,
  }),
}));

vi.mock("@/components/admin/sidebar", () => ({
  Sidebar: () => <nav data-testid="sidebar" />,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

describe("PortalLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.principal = null;
  });

  it("renders children for a member principal", () => {
    authState.principal = { kind: "user", role: "member" };

    render(
      <PortalLayout>
        <div>portal content</div>
      </PortalLayout>
    );

    expect(screen.getByText("portal content")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("redirects an admin user back to the dashboard and renders nothing", () => {
    authState.principal = { kind: "user", role: "admin" };

    render(
      <PortalLayout>
        <div>portal content</div>
      </PortalLayout>
    );

    expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    expect(screen.queryByText("portal content")).not.toBeInTheDocument();
  });

  it("redirects the admin-token identity back to the dashboard", () => {
    authState.principal = { kind: "admin_token", role: "admin" };

    render(
      <PortalLayout>
        <div>portal content</div>
      </PortalLayout>
    );

    expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    expect(screen.queryByText("portal content")).not.toBeInTheDocument();
  });

  it("keeps rendering while the principal is still unresolved", () => {
    authState.principal = null;

    render(
      <PortalLayout>
        <div>portal content</div>
      </PortalLayout>
    );

    expect(screen.getByText("portal content")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
