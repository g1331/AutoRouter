import { render, screen } from "@testing-library/react";
import type { ButtonHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DashboardLayout from "@/app/[locale]/(dashboard)/layout";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat("en-US", options).format(value),
  }),
}));

const mockBack = vi.fn();
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockPathname = "/logs/details";

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
  }),
}));

// principal 可变：用于验证 member 访问管理后台时被送回门户（决策九）。
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

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("lucide-react", () => ({
  ChevronLeft: () => <svg data-testid="icon-chevron-left" />,
}));

describe("DashboardLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/logs/details";
    authState.principal = null;
    window.localStorage.clear();
  });

  it("keeps the main content area shrinkable for horizontally scrollable children", () => {
    render(
      <DashboardLayout>
        <div>content</div>
      </DashboardLayout>
    );

    const main = screen.getByRole("main");

    expect(main.className).toContain("min-w-0");
    expect(main.className).toContain("overflow-y-auto");
  });

  it("redirects a member principal to the portal and renders nothing", () => {
    authState.principal = { kind: "user", role: "member" };

    render(
      <DashboardLayout>
        <div>content</div>
      </DashboardLayout>
    );

    expect(mockReplace).toHaveBeenCalledWith("/portal");
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("renders normally for an admin principal", () => {
    authState.principal = { kind: "user", role: "admin" };

    render(
      <DashboardLayout>
        <div>content</div>
      </DashboardLayout>
    );

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
