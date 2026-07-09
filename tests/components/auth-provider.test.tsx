import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";

import { AuthProvider, useAuth } from "@/providers/auth-provider";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

// AuthProvider 使用 next/navigation 的 useRouter / usePathname。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/dashboard",
}));

// apiClient 仅在业务请求时使用，这里桩掉以隔离副作用。
vi.mock("@/lib/api", () => ({
  createApiClient: () => ({
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

/**
 * 构造一个结构合法的三段 JWT，payload 为 base64url 编码且携带指定字段。
 * 仅供前端 decodeTokenRole 读取 role，签名不参与校验。
 */
function makeJwt(payload: Record<string, unknown>): string {
  const b64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `eyJhbGciOiJIUzI1NiJ9.${b64}.signature`;
}

function Consumer() {
  const { principal, isAuthenticated, token } = useAuth();
  return (
    <div>
      <span data-testid="ready">ready</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="kind">{principal?.kind ?? "none"}</span>
      <span data-testid="role">{principal?.role ?? "none"}</span>
      <span data-testid="username">{principal?.username ?? "none"}</span>
      <span data-testid="displayName">{principal?.displayName ?? "none"}</span>
      <span data-testid="token">{token ?? "none"}</span>
    </div>
  );
}

function Controls() {
  const { setToken, logout } = useAuth();
  return (
    <>
      <button type="button" onClick={() => setToken("plain-admin-token")}>
        do-set
      </button>
      <button type="button" onClick={() => logout()}>
        do-logout
      </button>
    </>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Consumer />
      <Controls />
    </AuthProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  global.fetch = vi.fn();
});

describe("AuthProvider principal 派生", () => {
  it("无 token 时未认证", async () => {
    renderProvider();
    await screen.findByTestId("ready");

    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
    expect(screen.getByTestId("kind")).toHaveTextContent("none");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("非 JWT 的 ADMIN_TOKEN 派生为超级管理员，且不请求用户档案", async () => {
    localStorage.setItem("admin_token", "plain-admin-token");
    renderProvider();
    await screen.findByTestId("ready");

    expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
    expect(screen.getByTestId("kind")).toHaveTextContent("admin_token");
    expect(screen.getByTestId("role")).toHaveTextContent("admin");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("member JWT 派生为普通用户并从 /api/auth/me 补充显示档案", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        kind: "user",
        role: "member",
        username: "alice",
        displayName: "Alice",
      }),
    });
    localStorage.setItem("admin_token", makeJwt({ role: "member" }));
    renderProvider();
    await screen.findByTestId("ready");

    expect(screen.getByTestId("kind")).toHaveTextContent("user");
    expect(screen.getByTestId("role")).toHaveTextContent("member");
    await waitFor(() => expect(screen.getByTestId("username")).toHaveTextContent("alice"));
    expect(screen.getByTestId("displayName")).toHaveTextContent("Alice");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining("Bearer "),
        }),
      })
    );
  });

  it("admin 角色的 JWT 派生为 user 主体且角色为 admin（区别于 ADMIN_TOKEN）", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        kind: "user",
        role: "admin",
        username: "root",
        displayName: "Root",
      }),
    });
    localStorage.setItem("admin_token", makeJwt({ role: "admin" }));
    renderProvider();
    await screen.findByTestId("ready");

    expect(screen.getByTestId("kind")).toHaveTextContent("user");
    expect(screen.getByTestId("role")).toHaveTextContent("admin");
    await waitFor(() => expect(screen.getByTestId("username")).toHaveTextContent("root"));
  });

  it("JWT 形态但 payload 缺少有效 role 时退化为未认证", async () => {
    localStorage.setItem("admin_token", makeJwt({ foo: "bar" }));
    renderProvider();
    await screen.findByTestId("ready");

    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
    expect(screen.getByTestId("kind")).toHaveTextContent("none");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("JWT 形态但 payload 无法解码时退化为未认证", async () => {
    localStorage.setItem("admin_token", "eyJhbGciOiJIUzI1NiJ9.@@@@.signature");
    renderProvider();
    await screen.findByTestId("ready");

    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
    expect(screen.getByTestId("kind")).toHaveTextContent("none");
  });

  it("setToken 写入 localStorage 并同步更新主体", async () => {
    renderProvider();
    await screen.findByTestId("ready");
    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");

    fireEvent.click(screen.getByText("do-set"));

    await waitFor(() => expect(screen.getByTestId("kind")).toHaveTextContent("admin_token"));
    expect(localStorage.getItem("admin_token")).toBe("plain-admin-token");
    expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
  });

  it("logout 清除凭据并跳转登录页", async () => {
    localStorage.setItem("admin_token", "plain-admin-token");
    renderProvider();
    await screen.findByTestId("ready");
    expect(screen.getByTestId("authenticated")).toHaveTextContent("true");

    fireEvent.click(screen.getByText("do-logout"));

    await waitFor(() => expect(screen.getByTestId("authenticated")).toHaveTextContent("false"));
    expect(localStorage.getItem("admin_token")).toBeNull();
    expect(pushMock).toHaveBeenCalledWith("/login");
  });
});
