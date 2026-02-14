"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";
import { Sidebar } from "@/components/admin/sidebar";
import { cn } from "@/lib/utils";

/**
 * Cassette Futurism Dashboard Layout
 *
 * Main application shell with:
 * - Authentication guard
 * - Responsive navigation (sidebar for desktop, bottom nav for mobile)
 * - Noise texture background effect
 * - Collapsible sidebar with hover expansion
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token } = useAuth();

  // Sidebar collapsed state - persisted to localStorage
  // Use lazy initialization to read from localStorage on first render (client-side only)
  // Note: This may cause a hydration mismatch, but it's acceptable for this UI preference
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("autorouter.sidebar.collapsed") === "true";
    }
    return false;
  });

  // Auth guard: redirect unauthenticated users to login
  useEffect(() => {
    if (!token) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [token, router, pathname]);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem("autorouter.sidebar.collapsed", String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Don't render content while redirecting
  if (!token) {
    return null;
  }

  return (
    <div className="cf-noise flex h-screen overflow-hidden bg-black-900">
      {/* Navigation */}
      <Sidebar
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((previousState) => !previousState)}
      />

      {/* Main Content Area */}
      <main
        className={cn(
          "flex-1 overflow-y-auto bg-surface-100 transition-all duration-300",
          // Mobile: no top header needed, content starts from top
          "pt-0",
          // Mobile: account for safe area + bottom nav (~72px + safe area)
          "pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0",
          // Desktop: adjust margin for fixed sidebar (w-20 = 80px, w-64 = 256px)
          isSidebarCollapsed ? "md:ml-20" : "md:ml-64"
        )}
      >
        {children}
      </main>
    </div>
  );
}
