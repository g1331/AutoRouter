"use client";

import { Sidebar } from "@/components/admin/sidebar";
import { MobilePulseStrip } from "@/components/admin/mobile-pulse-strip";
import { AppShell } from "@/components/layout/app-shell";
import { LivePulseProvider } from "@/providers/live-pulse-provider";

const MOBILE_ROOT_ROUTES = ["/dashboard", "/keys", "/upstreams", "/logs", "/settings"] as const;

function getMobileBackHref(pathname: string): string {
  if (pathname.startsWith("/system/")) {
    return "/settings";
  }
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return "/dashboard";
  }
  return `/${segments[0]}`;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LivePulseProvider>
      <AppShell
        sidebar={({ collapsed, onToggleCollapse }) => (
          <Sidebar collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
        )}
        mobileRootRoutes={MOBILE_ROOT_ROUTES}
        getMobileBackHref={getMobileBackHref}
        mobileHeaderCenter={<MobilePulseStrip />}
      >
        {children}
      </AppShell>
    </LivePulseProvider>
  );
}
