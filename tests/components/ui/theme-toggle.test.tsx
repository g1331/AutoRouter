import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThemeToggle } from "@/components/ui/theme-toggle";

// Mock next-themes
const mockSetTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "dark",
    setTheme: mockSetTheme,
  }),
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
  Moon: () => <svg data-testid="moon-icon" />,
  Sun: () => <svg data-testid="sun-icon" />,
  Monitor: () => <svg data-testid="monitor-icon" />,
  Check: () => <svg data-testid="check-icon" />,
}));

// Mock matchMedia
const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: mockMatchMedia,
});

describe("ThemeToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Pre-mount state (SSR)", () => {
    it("shows button before mount", () => {
      const { container } = render(<ThemeToggle />);

      // The button should be present
      expect(container.querySelector("button")).toBeInTheDocument();
    });

    it("renders sun icon in skeleton state", () => {
      render(<ThemeToggle />);

      // Sun icon is always rendered in skeleton
      expect(screen.getByTestId("sun-icon")).toBeInTheDocument();
    });

    it("renders screen reader text", () => {
      render(<ThemeToggle />);

      expect(screen.getByText("toggle")).toBeInTheDocument();
    });
  });
});
