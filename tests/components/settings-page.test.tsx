import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";

import SettingsPage from "@/app/[locale]/(dashboard)/settings/page";
import { APP_REPOSITORY_URL } from "@/lib/app-version";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

const portalSettingsQuery = vi.hoisted(() => ({
  data: { expose_upstreams: false, updated_at: "2026-07-01T00:00:00.000Z" } as
    | { expose_upstreams: boolean; updated_at: string }
    | undefined,
  isLoading: false,
}));
const updatePortalSettingsMutate = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-portal-settings", () => ({
  usePortalSettings: () => portalSettingsQuery,
  useUpdatePortalSettings: () => ({ mutate: updatePortalSettingsMutate, isPending: false }),
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
  DatabaseZap: () => <svg data-testid="icon-database-zap" />,
  Eye: () => <svg data-testid="icon-eye" />,
  Globe: () => <svg data-testid="icon-globe" />,
  Github: () => <svg data-testid="icon-github" />,
  LogOut: () => <svg data-testid="icon-logout" />,
  Moon: () => <svg data-testid="icon-moon" />,
  RefreshCw: () => <svg data-testid="icon-refresh-cw" />,
  ShieldAlert: () => <svg data-testid="icon-shield-alert" />,
  SlidersHorizontal: () => <svg data-testid="icon-sliders-horizontal" />,
  TerminalSquare: () => <svg data-testid="icon-terminal-square" />,
  Users: () => <svg data-testid="icon-users" />,
  Wallet: () => <svg data-testid="icon-wallet" />,
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    portalSettingsQuery.data = { expose_upstreams: false, updated_at: "2026-07-01T00:00:00.000Z" };
    portalSettingsQuery.isLoading = false;
    updatePortalSettingsMutate.mockClear();
  });

  it("renders repository card as an external link", () => {
    render(<SettingsPage />);

    const repositoryLink = screen.getByRole("link", { name: "repository.open" });
    expect(repositoryLink).toHaveAttribute("href", APP_REPOSITORY_URL);
    expect(repositoryLink).toHaveAttribute("target", "_blank");
    expect(repositoryLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("repository.title")).toBeInTheDocument();
    expect(screen.getByText("repository.description")).toBeInTheDocument();
  });

  it("renders background task settings entry", () => {
    render(<SettingsPage />);

    const backgroundSyncLink = screen.getByRole("link", { name: /backgroundSync.title/i });
    expect(backgroundSyncLink).toHaveAttribute("href", "/system/background-sync");
    expect(screen.getByText("backgroundSync.panelDescription")).toBeInTheDocument();
  });

  it("renders global failure rules settings entry", () => {
    render(<SettingsPage />);

    const failureRulesLink = screen.getByRole("link", { name: /upstreamFailureRules.title/i });
    expect(failureRulesLink).toHaveAttribute("href", "/system/failure-rules");
    expect(screen.getByText("upstreamFailureRules.settingsDescription")).toBeInTheDocument();
  });

  it("renders traffic recording settings entry", () => {
    render(<SettingsPage />);

    const trafficRecordingLink = screen.getByRole("link", { name: /trafficRecording.title/i });
    expect(trafficRecordingLink).toHaveAttribute("href", "/system/traffic-recording");
    expect(screen.getByText("trafficRecording.settingsDescription")).toBeInTheDocument();
  });

  it("renders user management settings entry", () => {
    render(<SettingsPage />);

    const usersLink = screen.getByRole("link", { name: /nav.users/i });
    expect(usersLink).toHaveAttribute("href", "/system/users");
    expect(screen.getByText("users.managementDesc")).toBeInTheDocument();
  });

  it("keeps the member upstream visibility toggle off by default and saves when switched on", () => {
    render(<SettingsPage />);

    const toggle = screen.getByRole("switch", { name: "portalSettings.exposeUpstreams" });
    expect(toggle).toHaveAttribute("data-state", "unchecked");
    expect(screen.getByText("portalSettings.exposeUpstreamsDesc")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(updatePortalSettingsMutate).toHaveBeenCalledWith({ expose_upstreams: true });
  });

  it("disables the visibility toggle until the current setting is loaded", () => {
    portalSettingsQuery.data = undefined;
    portalSettingsQuery.isLoading = true;

    render(<SettingsPage />);

    expect(screen.getByRole("switch", { name: "portalSettings.exposeUpstreams" })).toBeDisabled();
  });

  it("renders CLIProxyAPI settings entry", () => {
    render(<SettingsPage />);

    const cliproxyLink = screen.getByRole("link", { name: /nav.cliproxy/i });
    expect(cliproxyLink).toHaveAttribute("href", "/system/cliproxy");
    expect(screen.getByText("cliproxy.pageDescription")).toBeInTheDocument();
  });
});
