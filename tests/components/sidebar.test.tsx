import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Sidebar } from "@/components/admin/sidebar";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock i18n navigation
let mockPathname = "/dashboard";
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
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  LayoutDashboard: () => <svg data-testid="icon-dashboard" />,
  Key: () => <svg data-testid="icon-key" />,
  Server: () => <svg data-testid="icon-server" />,
  ScrollText: () => <svg data-testid="icon-scroll" />,
}));

describe("Sidebar", () => {
  beforeEach(() => {
    mockPathname = "/dashboard";
  });

  describe("Rendering", () => {
    it("renders sidebar with navigation role", () => {
      render(<Sidebar />);

      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    });

    it("renders brand name", () => {
      render(<Sidebar />);

      expect(screen.getByText("APPNAME")).toBeInTheDocument();
    });

    it("renders version info", () => {
      render(<Sidebar />);

      expect(screen.getByText(/ADMIN/)).toBeInTheDocument();
    });

    it("renders all navigation items", () => {
      render(<Sidebar />);

      expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
      expect(screen.getByText("APIKEYS")).toBeInTheDocument();
      expect(screen.getByText("UPSTREAMS")).toBeInTheDocument();
      expect(screen.getByText("LOGS")).toBeInTheDocument();
    });

    it("renders all navigation icons", () => {
      render(<Sidebar />);

      expect(screen.getByTestId("icon-dashboard")).toBeInTheDocument();
      expect(screen.getByTestId("icon-key")).toBeInTheDocument();
      expect(screen.getByTestId("icon-server")).toBeInTheDocument();
      expect(screen.getByTestId("icon-scroll")).toBeInTheDocument();
    });

    it("renders system status", () => {
      render(<Sidebar />);

      expect(screen.getByText("sysOk")).toBeInTheDocument();
    });
  });

  describe("Navigation Links", () => {
    it("renders correct hrefs", () => {
      render(<Sidebar />);

      const links = screen.getAllByRole("link");
      const hrefs = links.map((link) => link.getAttribute("href"));

      expect(hrefs).toContain("/dashboard");
      expect(hrefs).toContain("/keys");
      expect(hrefs).toContain("/upstreams");
      expect(hrefs).toContain("/logs");
    });
  });

  describe("Active State", () => {
    it("marks dashboard as active when on dashboard path", () => {
      mockPathname = "/dashboard";
      render(<Sidebar />);

      const dashboardLink = screen.getByRole("link", { name: /DASHBOARD/i });
      expect(dashboardLink).toHaveAttribute("aria-current", "page");
    });

    it("marks keys as active when on keys path", () => {
      mockPathname = "/keys";
      render(<Sidebar />);

      const keysLink = screen.getByRole("link", { name: /APIKEYS/i });
      expect(keysLink).toHaveAttribute("aria-current", "page");
    });

    it("marks upstreams as active when on upstreams path", () => {
      mockPathname = "/upstreams";
      render(<Sidebar />);

      const upstreamsLink = screen.getByRole("link", { name: /UPSTREAMS/i });
      expect(upstreamsLink).toHaveAttribute("aria-current", "page");
    });

    it("marks logs as active when on logs path", () => {
      mockPathname = "/logs";
      render(<Sidebar />);

      const logsLink = screen.getByRole("link", { name: /LOGS/i });
      expect(logsLink).toHaveAttribute("aria-current", "page");
    });

    it("marks keys as active on nested keys path", () => {
      mockPathname = "/keys/create";
      render(<Sidebar />);

      const keysLink = screen.getByRole("link", { name: /APIKEYS/i });
      expect(keysLink).toHaveAttribute("aria-current", "page");
    });

    it("does not mark other items as active", () => {
      mockPathname = "/dashboard";
      render(<Sidebar />);

      const keysLink = screen.getByRole("link", { name: /APIKEYS/i });
      const upstreamsLink = screen.getByRole("link", { name: /UPSTREAMS/i });
      const logsLink = screen.getByRole("link", { name: /LOGS/i });

      expect(keysLink).not.toHaveAttribute("aria-current", "page");
      expect(upstreamsLink).not.toHaveAttribute("aria-current", "page");
      expect(logsLink).not.toHaveAttribute("aria-current", "page");
    });
  });

  describe("Accessibility", () => {
    it("has main menu aria label", () => {
      render(<Sidebar />);

      expect(screen.getByRole("navigation", { name: "Main menu" })).toBeInTheDocument();
    });

    it("nav links have title attributes", () => {
      render(<Sidebar />);

      const links = screen.getAllByRole("link");
      links.forEach((link) => {
        expect(link).toHaveAttribute("title");
      });
    });
  });

  describe("Visual Enhancements (Fix for Issue #64)", () => {
    it("applies enhanced border styling to active item", () => {
      mockPathname = "/dashboard";
      render(<Sidebar />);

      const dashboardLink = screen.getByRole("link", { name: /DASHBOARD/i });
      expect(dashboardLink.className).toContain("border-l-4");
      expect(dashboardLink.className).toContain("border-l-amber-500");
    });

    it("applies scale effect to active item", () => {
      mockPathname = "/keys";
      render(<Sidebar />);

      const keysLink = screen.getByRole("link", { name: /APIKEYS/i });
      expect(keysLink.className).toContain("scale-[1.02]");
    });

    it("applies standard border to inactive items", () => {
      mockPathname = "/dashboard";
      render(<Sidebar />);

      const keysLink = screen.getByRole("link", { name: /APIKEYS/i });
      expect(keysLink.className).toContain("border-l-2");
      expect(keysLink.className).toContain("border-transparent");
    });

    it("applies pulse glow effect to active item", () => {
      mockPathname = "/upstreams";
      render(<Sidebar />);

      const upstreamsLink = screen.getByRole("link", { name: /UPSTREAMS/i });
      expect(upstreamsLink.className).toContain("cf-pulse-glow");
    });

    it("does not apply pulse glow to inactive items", () => {
      mockPathname = "/dashboard";
      render(<Sidebar />);

      const keysLink = screen.getByRole("link", { name: /APIKEYS/i });
      expect(keysLink.className).not.toContain("cf-pulse-glow");
    });

    it("applies enhanced styling consistently across all pages", () => {
      const pages = [
        { path: "/dashboard", name: /DASHBOARD/i },
        { path: "/keys", name: /APIKEYS/i },
        { path: "/upstreams", name: /UPSTREAMS/i },
        { path: "/logs", name: /LOGS/i },
      ];

      pages.forEach(({ path, name }) => {
        mockPathname = path;
        const { unmount } = render(<Sidebar />);

        const activeLink = screen.getByRole("link", { name });
        expect(activeLink.className).toContain("border-l-4");
        expect(activeLink.className).toContain("scale-[1.02]");
        expect(activeLink.className).toContain("cf-pulse-glow");

        unmount();
      });
    });
  });
});
