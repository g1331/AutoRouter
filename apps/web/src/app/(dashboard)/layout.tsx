"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { Sidebar } from "@/components/admin/sidebar";

/**
 * M3 Dashboard Layout
 * 包含认证守卫和 Navigation Rail
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { token } = useAuth();

  // 认证守卫：未登录用户重定向到登录页
  useEffect(() => {
    if (!token) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [token, router, pathname]);

  // 未登录，不渲染内容
  if (!token) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[rgb(var(--md-sys-color-surface))]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-[rgb(var(--md-sys-color-surface))]">
        {children}
      </main>
    </div>
  );
}
