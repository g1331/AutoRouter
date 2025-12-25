"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  useState,
  useCallback,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { createApiClient } from "@/lib/api";
import { toast } from "sonner";

/**
 * sessionStorage 键名
 */
const STORAGE_KEY = "admin_token";

/**
 * Auth Context 类型
 */
interface AuthContextType {
  token: string | null;
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
 * Auth Provider
 * 提供认证状态和 API 客户端
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const token = useSyncExternalStore(subscribeToStorage, getStorageSnapshot, getServerSnapshot);
  const [isHydrated, setIsHydrated] = useState(false);
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

  // 等待 hydration 完成
  if (!isHydrated) {
    return null; // 或者返回 loading 组件
  }

  return (
    <AuthContext.Provider value={{ token, setToken, logout, apiClient }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth hook
 * 访问认证状态和 API 客户端
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
