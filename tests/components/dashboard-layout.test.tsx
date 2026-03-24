import { render, screen } from "@testing-library/react";
import type { ButtonHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DashboardLayout from "@/app/[locale]/(dashboard)/layout";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockBack = vi.fn();
const mockPush = vi.fn();
let mockPathname = "/logs/details";

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
  }),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    token: "test-token",
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
});
