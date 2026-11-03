import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import enMessages from "@/messages/en.json";
import zhCNMessages from "@/messages/zh-CN.json";
import { LandingPage } from "@/components/landing/landing-page";
import { buildGatewayEndpoints } from "@/components/landing/connect-section";

const mockReplace = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  usePathname: () => "/",
}));

const authState: { current: { token: string | null; principal: { role: string } | null } } = {
  current: { token: null, principal: null },
};
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => authState.current,
}));

// 语言切换与主题切换各自有测试，这里只验证落地页自身的结构与行为。
vi.mock("@/components/language-switcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("@/components/ui/theme-toggle", () => ({ ThemeToggle: () => null }));

// jsdom 没有 IntersectionObserver；用永不触发的桩，动画循环保持静止，交互逻辑照常可测。
class IdleIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function renderLanding(locale: "en" | "zh-CN" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? enMessages : zhCNMessages}>
      <LandingPage />
    </NextIntlClientProvider>
  );
}

function upstreamStatuses() {
  return Object.fromEntries(
    screen
      .getAllByTestId("console-upstream")
      .map((node) => [
        node.textContent?.split(/[A-Z0-9]{2,}$/)[0],
        node.getAttribute("data-status"),
      ])
  );
}

function mockReducedMotion(reduced: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: reduced && query.includes("reduce"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IntersectionObserver", IdleIntersectionObserver);
  authState.current = { token: null, principal: null };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("buildGatewayEndpoints", () => {
  it("derives the shared proxy base URL and embeds it in every snippet", () => {
    const { baseUrl, snippets } = buildGatewayEndpoints("https://gw.example.org/");
    expect(baseUrl).toBe("https://gw.example.org/api/proxy/v1");
    expect(snippets.curl).toContain("curl https://gw.example.org/api/proxy/v1/chat/completions");
    expect(snippets.python).toContain('base_url="https://gw.example.org/api/proxy/v1"');
    expect(snippets.node).toContain('baseURL: "https://gw.example.org/api/proxy/v1"');
    expect(snippets.claude).toContain("ANTHROPIC_BASE_URL=https://gw.example.org/api/proxy/v1");
  });
});

describe("LandingPage", () => {
  it.each(["en", "zh-CN"] as const)("renders every section in %s", (locale) => {
    renderLanding(locale);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(6);
    expect(screen.getAllByTestId("console-upstream")).toHaveLength(4);
  });

  it("opens the live demo on the normal split", () => {
    renderLanding();
    expect(upstreamStatuses()).toEqual({
      "openai-primary": "serving",
      "anthropic-main": "serving",
      "azure-openai": "standby",
      "gemini-backup": "standby",
    });
  });

  it("jumps the demo to a story step when it is clicked", () => {
    renderLanding();
    fireEvent.click(screen.getByRole("button", { name: /Circuit opens/ }));

    expect(screen.getByRole("button", { name: /Circuit opens/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(upstreamStatuses()).toMatchObject({
      "anthropic-main": "open",
      "azure-openai": "serving",
    });
    expect(screen.getByText("Circuit open · anthropic-main")).toBeInTheDocument();
    expect(screen.getAllByText(/the backup azure-openai takes over/).length).toBeGreaterThan(0);
  });

  it("holds a static failover frame under reduced motion", async () => {
    mockReducedMotion(true);
    renderLanding();
    expect(upstreamStatuses()).toMatchObject({ "anthropic-main": "open" });
    await waitFor(() => expect(screen.getByText("502")).toBeInTheDocument());
  });

  it("shows this instance's base URL and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderLanding();

    const expected = `${window.location.origin}/api/proxy/v1`;
    expect(screen.getByTestId("gateway-base-url")).toHaveTextContent(expected);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy This gateway's base URL" }));
    });
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });

  it("switches example code between clients", () => {
    renderLanding();
    fireEvent.click(screen.getByRole("tab", { name: "Python" }));
    expect(screen.getByRole("tab", { name: "Python" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent(
      `base_url="${window.location.origin}/api/proxy/v1"`
    );
  });

  it("points every sign-in entry to the login page", () => {
    renderLanding();
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    const consoleLinks = screen.getAllByRole("link", { name: /Open console/ });
    expect(consoleLinks).toHaveLength(2);
    for (const link of consoleLinks) {
      expect(link).toHaveAttribute("href", "/login");
    }
  });

  it.each([
    ["member", "/portal"],
    ["admin", "/dashboard"],
  ])("redirects a signed-in %s to %s without rendering the landing", (role, target) => {
    authState.current = { token: "jwt", principal: { role } };
    const { container } = renderLanding();
    expect(container).toBeEmptyDOMElement();
    expect(mockReplace).toHaveBeenCalledWith(target);
  });
});
