import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Topbar } from "@/components/admin/topbar";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock auth provider
const mockLogout = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    logout: mockLogout,
  }),
}));

// Mock LanguageSwitcher
vi.mock("@/components/language-switcher", () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher">Language</div>,
}));

// Mock ThemeToggle
vi.mock("@/components/ui/theme-toggle", () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme</button>,
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
  LogOut: () => <svg data-testid="logout-icon" />,
}));

describe("Topbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders the title in uppercase", () => {
      render(<Topbar title="Dashboard" />);

      expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
    });

    it("renders header element", () => {
      render(<Topbar title="Test" />);

      expect(screen.getByRole("banner")).toBeInTheDocument();
    });

    it("renders language switcher", () => {
      render(<Topbar title="Test" />);

      expect(screen.getByTestId("language-switcher")).toBeInTheDocument();
    });

    it("renders theme toggle", () => {
      render(<Topbar title="Test" />);

      expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
    });

    it("renders status indicator", () => {
      render(<Topbar title="Test" />);

      expect(screen.getByText("STATUS:")).toBeInTheDocument();
      expect(screen.getByText("ONLINE")).toBeInTheDocument();
    });

    it("renders admin label", () => {
      render(<Topbar title="Test" />);

      expect(screen.getByText("ADMIN")).toBeInTheDocument();
    });

    it("renders terminal prompt indicator", () => {
      render(<Topbar title="Test" />);

      expect(screen.getByText(">>")).toBeInTheDocument();
    });
  });

  describe("User Menu", () => {
    it("renders user menu button with aria-label", () => {
      render(<Topbar title="Test" />);

      expect(screen.getByRole("button", { name: "User menu" })).toBeInTheDocument();
    });

    it("renders user avatar with A initial", () => {
      render(<Topbar title="Test" />);

      expect(screen.getByText("A")).toBeInTheDocument();
    });

    it("user menu button has correct attributes", () => {
      render(<Topbar title="Test" />);

      const menuButton = screen.getByRole("button", { name: "User menu" });
      expect(menuButton).toHaveAttribute("aria-haspopup", "menu");
    });
  });

  describe("Title Variants", () => {
    it("handles lowercase title", () => {
      render(<Topbar title="api keys" />);

      expect(screen.getByText("API KEYS")).toBeInTheDocument();
    });

    it("handles mixed case title", () => {
      render(<Topbar title="UpStreams" />);

      expect(screen.getByText("UPSTREAMS")).toBeInTheDocument();
    });

    it("handles empty title", () => {
      render(<Topbar title="" />);

      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent("");
    });
  });
});
