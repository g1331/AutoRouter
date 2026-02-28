import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LanguageSwitcher } from "@/components/language-switcher";

// Mock next-intl
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

// Mock i18n navigation
const mockReplace = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    toString: () => "",
  }),
}));

// Mock i18n config
vi.mock("@/i18n/config", () => ({
  locales: ["en", "zh"],
  localeNames: { en: "English", zh: "中文" },
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
  Check: () => <svg data-testid="check-icon" />,
  Globe: () => <svg data-testid="globe-icon" />,
}));

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders the language switcher button", () => {
      render(<LanguageSwitcher />);

      expect(screen.getByRole("button", { name: "switch" })).toBeInTheDocument();
    });

    it("renders globe icon", () => {
      render(<LanguageSwitcher />);

      expect(screen.getByTestId("globe-icon")).toBeInTheDocument();
    });

    it("renders current locale name", () => {
      render(<LanguageSwitcher />);

      expect(screen.getByText("English")).toBeInTheDocument();
    });

    it("button has correct aria-label", () => {
      render(<LanguageSwitcher />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "switch");
    });

    it("has dropdown menu trigger", () => {
      render(<LanguageSwitcher />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-haspopup", "menu");
    });
  });
});
