import { render, screen } from "@testing-library/react";
import type { ButtonHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockBack = vi.fn();
const mockPush = vi.fn();
let mockPathname = "/portal";
let mockToken: string | null = "test-token";

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
  }),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    token: mockToken,
  }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("lucide-react", () => ({
  ChevronLeft: () => <svg data-testid="icon-chevron-left" />,
}));

function renderShell(
  overrides: Partial<React.ComponentProps<typeof AppShell>> = {}
): ReturnType<typeof render> {
  return render(
    <AppShell
      sidebar={({ collapsed }) => <nav data-testid="sidebar" data-collapsed={String(collapsed)} />}
      mobileRootRoutes={["/portal"]}
      getMobileBackHref={() => "/portal"}
      {...overrides}
    >
      <div>content</div>
    </AppShell>
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/portal";
    mockToken = "test-token";
    window.localStorage.clear();
  });

  it("renders the sidebar slot and children when authenticated", () => {
    renderShell();

    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();

    const main = screen.getByRole("main");
    expect(main.className).toContain("min-w-0");
    expect(main.className).toContain("overflow-y-auto");
  });

  it("redirects to the login page and renders nothing without a token", () => {
    mockToken = null;

    renderShell();

    expect(screen.queryByText("content")).not.toBeInTheDocument();
    expect(mockPush).toHaveBeenCalledWith(`/login?redirect=${encodeURIComponent("/portal")}`);
  });

  it("hides the mobile back button on a mobile root route", () => {
    mockPathname = "/portal/keys";

    renderShell();

    // /portal/keys is inside the /portal root prefix, so no back button.
    expect(screen.queryByTestId("icon-chevron-left")).not.toBeInTheDocument();
  });

  it("shows the mobile back button outside the mobile root routes", () => {
    mockPathname = "/somewhere/nested";

    renderShell();

    expect(screen.getByTestId("icon-chevron-left")).toBeInTheDocument();
  });

  it("renders the optional mobile header center slot", () => {
    renderShell({ mobileHeaderCenter: <div data-testid="pulse-strip" /> });

    expect(screen.getByTestId("pulse-strip")).toBeInTheDocument();
  });

  it("pins the shell to the viewport so <main> is the scroll container", () => {
    renderShell();

    const main = screen.getByRole("main");
    // h-dvh (not min-h-dvh) on the wrapper keeps sticky topbars working.
    expect(main.parentElement?.className).toContain("h-dvh");
    expect(main.parentElement?.className).not.toContain("min-h-dvh");
  });

  it("resets the main scroll position on navigation", () => {
    const { rerender } = renderShell();

    const main = screen.getByRole("main");
    main.scrollTop = 500;

    mockPathname = "/somewhere/else";
    rerender(
      <AppShell
        sidebar={({ collapsed }) => (
          <nav data-testid="sidebar" data-collapsed={String(collapsed)} />
        )}
        mobileRootRoutes={["/portal"]}
        getMobileBackHref={() => "/portal"}
      >
        <div>content</div>
      </AppShell>
    );

    expect(main.scrollTop).toBe(0);
  });
});
