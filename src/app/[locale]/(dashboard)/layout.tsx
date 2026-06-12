"use client";

import { useEffect } from "react";

import { Sidebar } from "@/components/admin/sidebar";
import { MobilePulseStrip } from "@/components/admin/mobile-pulse-strip";
import { AppShell } from "@/components/layout/app-shell";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";
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
  const router = useRouter();
  const { principal } = useAuth();
  // 客户端守卫（决策九）：member 访问管理后台一律送回门户；
  // 服务端管理接口对 member 仍返回 403 兜底。
  const isMember = principal?.role === "member";

  useEffect(() => {
    if (isMember) {
      router.replace("/portal");
    }
  }, [isMember, router]);

  if (isMember) {
    return null;
  }

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
