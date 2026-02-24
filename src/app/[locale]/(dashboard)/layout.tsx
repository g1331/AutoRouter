"use client";

import { useEffect, useState } from "react";

import { Sidebar } from "@/components/admin/sidebar";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token } = useAuth();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return localStorage.getItem("autorouter.sidebar.collapsed") === "true";
  });

  useEffect(() => {
    if (!token) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [token, router, pathname]);

  useEffect(() => {
    localStorage.setItem("autorouter.sidebar.collapsed", String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  if (!token) {
    return null;
  }

  return (
    <div className="flex min-h-dvh w-full overflow-hidden bg-background text-foreground">
      <Sidebar
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((value) => !value)}
      />

      <main
        className={cn(
          "flex-1 overflow-y-auto transition-[margin] duration-cf-normal ease-cf-standard",
          "pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0",
          isSidebarCollapsed ? "md:ml-20" : "md:ml-64"
        )}
      >
        {children}
      </main>
    </div>
  );
}
