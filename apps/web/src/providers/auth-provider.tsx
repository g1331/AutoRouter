"use client";

import { createContext, useContext, useEffect, useState } from "react";
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
 * Auth Provider
 * 提供认证状态和 API 客户端
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // 从 sessionStorage 恢复 token（仅客户端）
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        setTokenState(stored);
      }
      setIsHydrated(true);
    }
  }, []);

  // 设置 token
  const setToken = (newToken: string) => {
    setTokenState(newToken);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, newToken);
    }
  };

  // 登出
  const logout = () => {
    setTokenState(null);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    router.push("/login");
    toast.info("已登出");
  };

  // 处理 401 错误
  const handleUnauthorized = () => {
    // 避免在登录页面重复重定向
    if (pathname === "/login") return;

    setTokenState(null);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    toast.error("认证已过期，请重新登录");
    router.push("/login");
  };

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
