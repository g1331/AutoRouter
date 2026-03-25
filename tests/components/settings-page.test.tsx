import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import SettingsPage from "@/app/[locale]/(dashboard)/settings/page";
import { APP_REPOSITORY_URL } from "@/lib/app-version";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    logout: vi.fn(),
  }),
}));

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
}));

vi.mock("@/components/language-switcher", () => ({
  LanguageSwitcher: () => <button type="button">Language</button>,
}));

vi.mock("@/components/ui/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

vi.mock("@/components/admin/topbar", () => ({
  Topbar: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className, ...props }: { children: React.ReactNode; className?: string }) => (
    <div className={className} {...props}>
      {children}
    </div>
  ),
  CardContent: ({
    children,
    className,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div className={className} {...props}>
      {children}
    </div>
  ),
}));

vi.mock("lucide-react", () => ({
  ArrowUpRight: () => <svg data-testid="icon-arrow-up-right" />,
  ArrowLeftRight: () => <svg data-testid="icon-arrow-left-right" />,
  Globe: () => <svg data-testid="icon-globe" />,
  Github: () => <svg data-testid="icon-github" />,
  LogOut: () => <svg data-testid="icon-logout" />,
  Moon: () => <svg data-testid="icon-moon" />,
  SlidersHorizontal: () => <svg data-testid="icon-sliders-horizontal" />,
  Wallet: () => <svg data-testid="icon-wallet" />,
}));

describe("SettingsPage", () => {
  it("renders repository card as an external link", () => {
    render(<SettingsPage />);

    const repositoryLink = screen.getByRole("link", { name: "repository.open" });
    expect(repositoryLink).toHaveAttribute("href", APP_REPOSITORY_URL);
    expect(repositoryLink).toHaveAttribute("target", "_blank");
    expect(repositoryLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("repository.title")).toBeInTheDocument();
    expect(screen.getByText("repository.description")).toBeInTheDocument();
  });
});
