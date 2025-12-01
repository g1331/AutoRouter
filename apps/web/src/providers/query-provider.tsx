"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Query Provider
 * 配置 TanStack Query 客户端
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000, // 30 秒内不重新获取
            gcTime: 5 * 60 * 1000, // 缓存保留 5 分钟（原 cacheTime）
            retry: 1, // 失败重试 1 次
            refetchOnWindowFocus: false, // 窗口聚焦不自动重新获取
          },
          mutations: {
            retry: 0, // mutation 不重试
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
