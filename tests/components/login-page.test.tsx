import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";

import LoginPage from "@/app/[locale]/(auth)/login/page";

// next-intl：翻译函数直接回传 key，便于按 key 断言文案。
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// 登录页使用 next/navigation 的 useSearchParams，默认无 redirect 参数。
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));

// 路由跳转来自 @/i18n/navigation 的本地化 useRouter。
const { pushMock, setTokenMock, tokenGetMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  setTokenMock: vi.fn(),
  tokenGetMock: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ setToken: setTokenMock, token: null }),
}));

// 令牌模式探针经 createApiClient().get 发起，这里桩掉以便断言与控制结果。
vi.mock("@/lib/api", () => ({
  createApiClient: () => ({ get: tokenGetMock }),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/language-switcher", () => ({
  LanguageSwitcher: () => <button type="button">Language</button>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: {
    children: React.ReactNode;
    variant?: string;
    size?: string;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/password-input", () => ({
  PasswordInput: ({
    allowPasswordManager: _allowPasswordManager,
    ...props
  }: { allowPasswordManager?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/**
 * 等待开机动画结束、表单字段可交互（showForm=true 后输入框解除 disabled）。
 */
async function waitForForm() {
  await waitFor(() => expect(screen.getByLabelText("username")).not.toBeDisabled());
}

beforeEach(() => {
  vi.clearAllMocks();
  // prefers-reduced-motion: reduce 让 BootSequence 立即完成开机序列。
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  global.fetch = vi.fn();
});

describe("LoginPage 双模式登录", () => {
  it("默认进入账号登录模式，渲染用户名与密码字段", async () => {
    render(<LoginPage />);
    await waitForForm();

    expect(screen.getByLabelText("username")).toBeInTheDocument();
    expect(screen.getByLabelText("password")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "accountTab" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: "tokenTab" })).toHaveAttribute("aria-selected", "false");
  });

  it("切换到管理员令牌模式后展示令牌字段", async () => {
    render(<LoginPage />);
    await waitForForm();

    fireEvent.click(screen.getByRole("tab", { name: "tokenTab" }));

    expect(screen.getByLabelText("adminToken")).toBeInTheDocument();
    expect(screen.queryByLabelText("username")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tokenTab" })).toHaveAttribute("aria-selected", "true");
  });

  it("账号登录成功调用登录端点并写入返回的 token", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: "issued-jwt", user: { id: "u1" } }),
    });

    render(<LoginPage />);
    await waitForForm();

    fireEvent.change(screen.getByLabelText("username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("password"), { target: { value: "Sup3rSecret!" } });
    fireEvent.click(screen.getByRole("button", { name: "loginButton" }));

    await waitFor(() => expect(setTokenMock).toHaveBeenCalledWith("issued-jwt"));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "alice", password: "Sup3rSecret!" }),
      })
    );
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("账号登录返回 401 时显示凭据无效且不写入 token", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid username or password" }),
    });

    render(<LoginPage />);
    await waitForForm();

    fireEvent.change(screen.getByLabelText("username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("password"), { target: { value: "wrong-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "loginButton" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("invalidCredentials"));
    expect(setTokenMock).not.toHaveBeenCalled();
  });

  it("账号登录返回 429 时提示尝试次数过多", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "Too many failed login attempts. Try again later." }),
    });

    render(<LoginPage />);
    await waitForForm();

    fireEvent.change(screen.getByLabelText("username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("password"), { target: { value: "whatever" } });
    fireEvent.click(screen.getByRole("button", { name: "loginButton" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("tooManyAttempts"));
    expect(setTokenMock).not.toHaveBeenCalled();
  });

  it("账号模式提交空字段时进行本地校验且不发起请求", async () => {
    render(<LoginPage />);
    await waitForForm();

    fireEvent.click(screen.getByRole("button", { name: "loginButton" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("invalidCredentials"));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(setTokenMock).not.toHaveBeenCalled();
  });

  it("令牌模式探针成功后写入 token", async () => {
    tokenGetMock.mockResolvedValue({ data: [] });

    render(<LoginPage />);
    await waitForForm();

    fireEvent.click(screen.getByRole("tab", { name: "tokenTab" }));
    fireEvent.change(screen.getByLabelText("adminToken"), { target: { value: "admin-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "loginButton" }));

    await waitFor(() => expect(setTokenMock).toHaveBeenCalledWith("admin-secret"));
    expect(tokenGetMock).toHaveBeenCalledWith("/admin/keys?page=1&page_size=1");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("令牌模式探针失败时显示令牌无效", async () => {
    tokenGetMock.mockRejectedValue(new Error("unauthorized"));

    render(<LoginPage />);
    await waitForForm();

    fireEvent.click(screen.getByRole("tab", { name: "tokenTab" }));
    fireEvent.change(screen.getByLabelText("adminToken"), { target: { value: "bad-token" } });
    fireEvent.click(screen.getByRole("button", { name: "loginButton" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("invalidToken"));
    expect(setTokenMock).not.toHaveBeenCalled();
  });
});
