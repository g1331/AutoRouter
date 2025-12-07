"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";
import { Sidebar } from "@/components/admin/sidebar";

/**
 * Cassette Futurism Dashboard Layout
 *
 * Main application shell with:
 * - Authentication guard
 * - Sidebar navigation
 * - Noise texture background effect
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { token } = useAuth();

  // Auth guard: redirect unauthenticated users to login
  useEffect(() => {
    if (!token) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [token, router, pathname]);

  // Don't render content while redirecting
  if (!token) {
    return null;
  }

  return (
    <div className="cf-noise flex h-screen overflow-hidden bg-black-900">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-surface-100">
        {children}
      </main>
    </div>
  );
}
