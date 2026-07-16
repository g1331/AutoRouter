import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Sidebar } from "@/components/admin/sidebar";
import { APP_REPOSITORY_URL, APP_VERSION_TAG } from "@/lib/app-version";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// Mock i18n navigation
let mockPathname = "/dashboard";
const mockReplace = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    className,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
  usePathname: () => mockPathname,
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  LayoutDashboard: () => <svg data-testid="icon-dashboard" />,
  Key: () => <svg data-testid="icon-key" />,
  KeyRound: () => <svg data-testid="icon-key-round" />,
  Server: () => <svg data-testid="icon-server" />,
  ScrollText: () => <svg data-testid="icon-scroll" />,
  Menu: () => <svg data-testid="icon-menu" />,
  ChevronLeft: () => <svg data-testid="icon-chevron" />,
  LogOut: () => <svg data-testid="icon-logout" />,
  Settings: () => <svg data-testid="icon-settings" />,
  Check: () => <svg data-testid="icon-check" />,
  DatabaseZap: () => <svg data-testid="icon-database-zap" />,
  Globe: () => <svg data-testid="icon-globe" />,
  Sun: () => <svg data-testid="icon-sun" />,
  Moon: () => <svg data-testid="icon-moon" />,
  Monitor: () => <svg data-testid="icon-monitor" />,
  Wrench: () => <svg data-testid="icon-wrench" />,
  ArrowLeftRight: () => <svg data-testid="icon-arrow-left-right" />,
  ShieldAlert: () => <svg data-testid="icon-shield-alert" />,
  TerminalSquare: () => <svg data-testid="icon-terminal-square" />,
  Wallet: () => <svg data-testid="icon-wallet" />,
  RefreshCw: () => <svg data-testid="icon-refresh-cw" />,
  Github: () => <svg data-testid="icon-github" />,
  Users: () => <svg data-testid="icon-users" />,
  Trophy: () => <svg data-testid="icon-trophy" />,
}));

// Mock useAuth hook
const mockLogout = vi.fn();
// 可变角色：用于验证用户管理入口按角色显隐
const authState = vi.hoisted(() => ({ role: "admin" as "admin" | "member" }));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    logout: mockLogout,
    token: "test-token",
    setToken: vi.fn(),
    apiClient: {},
    principal: { kind: "user", role: authState.role, username: "u", displayName: "U" },
  }),
}));

// Mock LanguageSwitcher
vi.mock("@/components/language-switcher", () => ({
  LanguageSwitcher: () => <button data-testid="language-switcher">Language</button>,
}));

// Mock ThemeToggle
vi.mock("@/components/ui/theme-toggle", () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme</button>,
}));

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: vi.fn(),
  }),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Button component
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

describe("Sidebar", () => {
  const onToggleCollapse = vi.fn();

  function renderSidebar(props?: { collapsed?: boolean }) {
    return render(
      <Sidebar collapsed={props?.collapsed ?? false} onToggleCollapse={onToggleCollapse} />
    );
  }

  beforeEach(() => {
    mockPathname = "/dashboard";
    onToggleCollapse.mockReset();
    mockLogout.mockReset();
    authState.role = "admin";
  });

  describe("Rendering", () => {
    it("renders sidebar with navigation role", () => {
      renderSidebar();

      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    });

    it("renders brand name", () => {
      renderSidebar();

      expect(screen.getByText("appName")).toBeInTheDocument();
    });

    it("renders version info", () => {
      renderSidebar();

      expect(screen.getByText(APP_VERSION_TAG)).toBeInTheDocument();
    });

    it("renders all navigation items", () => {
      renderSidebar();

      expect(screen.getAllByText("dashboard").length).toBeGreaterThan(0);
      expect(screen.getAllByText("apiKeys").length).toBeGreaterThan(0);
      expect(screen.getAllByText("upstreams").length).toBeGreaterThan(0);
      expect(screen.getAllByText("settings").length).toBeGreaterThan(0);
      expect(screen.getAllByText("billing").length).toBeGreaterThan(0);
      expect(screen.getAllByText("trafficRecording").length).toBeGreaterThan(0);
      expect(screen.getAllByText("globalFailureRules").length).toBeGreaterThan(0);
    });

    it("renders all navigation icons", () => {
      renderSidebar();

      // Icons appear in both desktop and mobile nav, so check at least one exists
      expect(screen.getAllByTestId("icon-dashboard").length).toBeGreaterThan(0);
      expect(screen.getAllByTestId("icon-key").length).toBeGreaterThan(0);
      expect(screen.getAllByTestId("icon-server").length).toBeGreaterThan(0);
      expect(screen.getAllByTestId("icon-settings").length).toBeGreaterThan(0);
      expect(screen.getAllByTestId("icon-wallet").length).toBeGreaterThan(0);
      expect(screen.getAllByTestId("icon-database-zap").length).toBeGreaterThan(0);
      expect(screen.getAllByTestId("icon-shield-alert").length).toBeGreaterThan(0);
    });

    it("does not render deprecated system status label", () => {
      renderSidebar();

      expect(screen.queryByText("sysOk")).not.toBeInTheDocument();
    });

    it("renders logout button", () => {
      renderSidebar();

      expect(screen.getByText("logout")).toBeInTheDocument();
    });

    it("renders repository shortcut", () => {
      renderSidebar();

      expect(screen.getByRole("link", { name: "open" })).toHaveAttribute(
        "href",
        APP_REPOSITORY_URL
      );
    });
  });

  describe("Navigation Links", () => {
    it("renders correct hrefs", () => {
      renderSidebar();

      const links = screen.getAllByRole("link");
      const hrefs = links.map((link) => link.getAttribute("href"));

      expect(hrefs).toContain("/dashboard");
      expect(hrefs).toContain("/keys");
      expect(hrefs).toContain("/upstreams");
      expect(hrefs).toContain("/logs");
      expect(hrefs).toContain("/system/traffic-recording");
      expect(hrefs).toContain("/system/failure-rules");
      expect(hrefs).toContain(APP_REPOSITORY_URL);
    });
  });

  describe("Active State", () => {
    it("marks dashboard as active when on dashboard path", () => {
      mockPathname = "/dashboard";
      renderSidebar();

      const dashboardLinks = screen.getAllByRole("link", { name: /dashboard/i });
      expect(dashboardLinks[0]).toHaveAttribute("aria-current", "page");
    });

    it("marks keys as active when on keys path", () => {
      mockPathname = "/keys";
      renderSidebar();

      const keysLinks = screen.getAllByRole("link", { name: /apiKeys/i });
      expect(keysLinks[0]).toHaveAttribute("aria-current", "page");
    });

    it("marks upstreams as active when on upstreams path", () => {
      mockPathname = "/upstreams";
      renderSidebar();

      const upstreamsLinks = screen.getAllByRole("link", { name: /upstreams/i });
      expect(upstreamsLinks[0]).toHaveAttribute("aria-current", "page");
    });

    it("marks logs as active when on logs path", () => {
      mockPathname = "/logs";
      renderSidebar();

      const logsLinks = screen.getAllByRole("link", { name: /logs/i });
      expect(logsLinks[0]).toHaveAttribute("aria-current", "page");
    });

    it("marks keys as active on nested keys path", () => {
      mockPathname = "/keys/create";
      renderSidebar();

      const keysLinks = screen.getAllByRole("link", { name: /apiKeys/i });
      expect(keysLinks[0]).toHaveAttribute("aria-current", "page");
    });

    it("does not mark other items as active", () => {
      mockPathname = "/dashboard";
      renderSidebar();

      const keysLinks = screen.getAllByRole("link", { name: /apiKeys/i });
      const upstreamsLinks = screen.getAllByRole("link", { name: /upstreams/i });
      const logsLinks = screen.getAllByRole("link", { name: /logs/i });

      // Check desktop nav links (first in the list)
      expect(keysLinks[0]).not.toHaveAttribute("aria-current", "page");
      expect(upstreamsLinks[0]).not.toHaveAttribute("aria-current", "page");
      expect(logsLinks[0]).not.toHaveAttribute("aria-current", "page");
    });
  });

  describe("Accessibility", () => {
    it("has main menu aria label", () => {
      renderSidebar();

      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    });

    it("has bottom navigation for mobile", () => {
      renderSidebar();

      expect(screen.getByRole("navigation", { name: "Bottom navigation" })).toBeInTheDocument();
    });

    it("desktop nav links have title attributes", () => {
      renderSidebar();

      // Get desktop navigation links (they have title attributes for tooltips)
      const mainNav = screen.getByRole("navigation", { name: "Main navigation" });
      const desktopLinks = mainNav.querySelectorAll("a[title]");

      expect(desktopLinks.length).toBeGreaterThan(0);
      desktopLinks.forEach((link) => {
        expect(link).toHaveAttribute("title");
      });
    });
  });

  describe("Visual Enhancements", () => {
    it("applies border styling to active item", () => {
      mockPathname = "/dashboard";
      renderSidebar();

      const dashboardLinks = screen.getAllByRole("link", { name: /dashboard/i });
      expect(dashboardLinks[0].className).toContain("border");
      expect(dashboardLinks[0].className).toContain("border-amber-500/45");
    });

    it("applies standard border to inactive items", () => {
      mockPathname = "/dashboard";
      renderSidebar();

      const keysLinks = screen.getAllByRole("link", { name: /apiKeys/i });
      expect(keysLinks[0].className).toContain("border");
      expect(keysLinks[0].className).toContain("border-transparent");
    });

    it("applies enhanced styling consistently across all pages", () => {
      const pages = [
        { path: "/dashboard", name: /dashboard/i },
        { path: "/keys", name: /apiKeys/i },
        { path: "/upstreams", name: /upstreams/i },
        { path: "/logs", name: /logs/i },
      ];

      pages.forEach(({ path, name }) => {
        mockPathname = path;
        const { unmount } = renderSidebar();

        const activeLinks = screen.getAllByRole("link", { name });
        expect(activeLinks[0].className).toContain("border");
        expect(activeLinks[0].className).toContain("border-amber-500/45");

        unmount();
      });
    });
  });

  describe("Collapse Functionality", () => {
    it("calls onToggleCollapse when collapse button is clicked", () => {
      renderSidebar({ collapsed: false });

      // Find collapse toggle button (ChevronLeft icon)
      const buttons = screen.getAllByRole("button");
      const toggleButton = buttons.find((btn) => btn.innerHTML.includes("icon-chevron"));

      if (toggleButton) {
        toggleButton.click();
        expect(onToggleCollapse).toHaveBeenCalled();
      }
    });

    it("renders in collapsed state when collapsed prop is true", () => {
      renderSidebar({ collapsed: true });

      // Sidebar should be in the document
      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    });
  });

  describe("Role-based navigation", () => {
    it("shows user management entry for admin principal", () => {
      authState.role = "admin";
      renderSidebar();

      expect(screen.getAllByText("users").length).toBeGreaterThan(0);
    });

    it("hides user management entry for member principal", () => {
      authState.role = "member";
      renderSidebar();

      expect(screen.queryByText("users")).not.toBeInTheDocument();
    });

    it("renders the portal navigation set for member principal", () => {
      authState.role = "member";
      mockPathname = "/portal";
      renderSidebar();

      // 门户四项在桌面与移动导航各出现一次
      expect(screen.getAllByText("overview").length).toBeGreaterThan(0);
      expect(screen.getAllByText("myRequests").length).toBeGreaterThan(0);
      expect(screen.getAllByText("myKeys").length).toBeGreaterThan(0);
      expect(screen.getAllByText("changePassword").length).toBeGreaterThan(0);

      // 管理后台导航与 System 组对 member 不可见
      expect(screen.queryByText("dashboard")).not.toBeInTheDocument();
      expect(screen.queryByText("apiKeys")).not.toBeInTheDocument();
      expect(screen.queryByText("upstreams")).not.toBeInTheDocument();
      expect(screen.queryByText("system")).not.toBeInTheDocument();
      expect(screen.queryByText("billing")).not.toBeInTheDocument();
    });

    it("does not render the portal navigation set for admin principal", () => {
      authState.role = "admin";
      renderSidebar();

      expect(screen.queryByText("overview")).not.toBeInTheDocument();
      expect(screen.queryByText("myKeys")).not.toBeInTheDocument();
    });

    it("uses a four-column mobile grid for member and five for admin", () => {
      authState.role = "member";
      const { unmount } = renderSidebar();
      const memberNav = screen.getByRole("navigation", { name: "Bottom navigation" });
      expect(memberNav.querySelector(".grid")?.className).toContain("grid-cols-4");
      unmount();

      authState.role = "admin";
      renderSidebar();
      const adminNav = screen.getByRole("navigation", { name: "Bottom navigation" });
      expect(adminNav.querySelector(".grid")?.className).toContain("grid-cols-5");
    });

    it("matches the portal overview entry exactly so subpages do not highlight it", () => {
      authState.role = "member";
      mockPathname = "/portal/keys";
      renderSidebar();

      const overviewLinks = screen.getAllByRole("link", { name: /overview/i });
      const myKeysLinks = screen.getAllByRole("link", { name: /myKeys/i });
      overviewLinks.forEach((link) => {
        expect(link).not.toHaveAttribute("aria-current", "page");
      });
      expect(myKeysLinks[0]).toHaveAttribute("aria-current", "page");
    });
  });
});
