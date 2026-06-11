"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { createApiClient } from "@/lib/api";
import { toast } from "sonner";

/**
 * sessionStorage 键名
 */
const STORAGE_KEY = "admin_token";

export type AuthRole = "admin" | "member";

/**
 * 当前登录主体。`admin_token` 表示通过 ADMIN_TOKEN 登录的超级管理员（无用户档案），
 * `user` 表示通过账号密码登录的平台用户。role 由 token 同步派生，username/displayName
 * 由 `/api/auth/me` 异步补充，未取得前为 null。
 */
export interface AuthPrincipal {
  kind: "admin_token" | "user";
  role: AuthRole;
  username: string | null;
  displayName: string | null;
}

interface AuthMeResponse {
  kind: "admin_token" | "user";
  role: AuthRole;
  username?: string;
  displayName?: string;
}

/**
 * Auth Context 类型
 */
interface AuthContextType {
  token: string | null;
  principal: AuthPrincipal | null;
  isAuthenticated: boolean;
  setToken: (token: string) => void;
  logout: () => void;
  apiClient: ReturnType<typeof createApiClient>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * 订阅 sessionStorage 变化
 */
function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

/**
 * 获取 sessionStorage 中的 token
 */
function getStorageSnapshot() {
  return sessionStorage.getItem(STORAGE_KEY);
}

/**
 * SSR 时返回 null
 */
function getServerSnapshot() {
  return null;
}

/**
 * Decode the role claim from a token without verifying its signature. This is a
 * best-effort, client-side hint used only to choose the right UI before the
 * server confirms the session; the server stays the source of truth and rejects
 * an invalid token with 401.
 *
 * Returns the role for a well-formed user JWT, `undefined` when the token is not
 * JWT-shaped (treated as an ADMIN_TOKEN super-admin credential), and `null` when
 * the token looks like a JWT but its payload is malformed (degraded to
 * unauthenticated rather than throwing).
 */
function decodeTokenRole(token: string): AuthRole | null | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return undefined;
  }
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized)) as { role?: unknown };
    if (payload.role === "admin" || payload.role === "member") {
      return payload.role;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Derive the base principal (kind + role) synchronously from the token snapshot.
 * Display fields are filled in asynchronously from `/api/auth/me`.
 */
function deriveBasePrincipal(token: string | null): AuthPrincipal | null {
  if (!token) {
    return null;
  }
  const role = decodeTokenRole(token);
  if (role === undefined) {
    return { kind: "admin_token", role: "admin", username: null, displayName: null };
  }
  if (role === null) {
    return null;
  }
  return { kind: "user", role, username: null, displayName: null };
}

/**
 * Auth Provider
 * 提供认证状态、当前主体和 API 客户端
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const token = useSyncExternalStore(subscribeToStorage, getStorageSnapshot, getServerSnapshot);
  const [isHydrated, setIsHydrated] = useState(false);
  const [profile, setProfile] = useState<{
    token: string;
    username: string;
    displayName: string;
  } | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // 标记 hydration 完成（这是 hydration 场景的标准模式）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration flag is a valid use case
    setIsHydrated(true);
  }, []);

  // 设置 token（写入 sessionStorage 会触发 useSyncExternalStore 更新）
  const setToken = useCallback((newToken: string) => {
    sessionStorage.setItem(STORAGE_KEY, newToken);
    // 手动触发 storage 事件以更新同一窗口的状态
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  }, []);

  // 清除 token
  const clearToken = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  }, []);

  // 登出
  const logout = useCallback(() => {
    clearToken();
    router.push("/login");
    toast.info("已登出");
  }, [clearToken, router]);

  // 处理 401 错误
  const handleUnauthorized = useCallback(() => {
    // 避免在登录页面重复重定向
    if (pathname === "/login") return;

    clearToken();
    toast.error("认证已过期，请重新登录");
    router.push("/login");
  }, [clearToken, pathname, router]);

  // 创建 API 客户端
  const apiClient = createApiClient({
    getToken: () => token,
    onUnauthorized: handleUnauthorized,
  });

  // 由 token 快照同步派生主体的 kind 与 role；token 不变则引用稳定。
  const basePrincipal = useMemo(() => deriveBasePrincipal(token), [token]);

  // 取得 token 后从服务端加载显示档案（username/displayName）。role 已由
  // basePrincipal 提供用于即时的角色路由，这里只补充显示字段；ADMIN_TOKEN
  // 超级管理员没有用户档案。直接 fetch 而非经 apiClient，避免依赖每次渲染重建的
  // 客户端；token 失效的 401 由后续真实业务请求经 apiClient 统一处理。档案随其
  // 所属 token 一并保存，从而无需在 effect 内同步清空状态，旧 token 的残留档案
  // 由下方派生层按 token 过滤。
  useEffect(() => {
    if (!token || basePrincipal?.kind !== "user") {
      return;
    }
    let cancelled = false;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (cancelled || !response.ok) {
          return;
        }
        const me = (await response.json()) as AuthMeResponse;
        if (me.kind === "user" && me.username && me.displayName) {
          setProfile({ token, username: me.username, displayName: me.displayName });
        }
      })
      .catch(() => {
        // 网络或解析错误时保持档案未补充，不影响基于角色的 UI。
      });
    return () => {
      cancelled = true;
    };
  }, [token, basePrincipal?.kind]);

  // 仅当档案确属当前 token 的用户主体时才合入显示字段；ADMIN_TOKEN 主体与
  // token 切换后残留的旧档案都在此被排除（basePrincipal 的显示字段本就为 null）。
  const principal = useMemo<AuthPrincipal | null>(() => {
    if (!basePrincipal) {
      return null;
    }
    if (basePrincipal.kind === "user" && profile?.token === token) {
      return {
        ...basePrincipal,
        username: profile.username,
        displayName: profile.displayName,
      };
    }
    return basePrincipal;
  }, [basePrincipal, profile, token]);

  // 等待 hydration 完成
  if (!isHydrated) {
    return null; // 或者返回 loading 组件
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        principal,
        isAuthenticated: principal !== null,
        setToken,
        logout,
        apiClient,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth hook
 * 访问认证状态、当前主体和 API 客户端
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
