"use client";

import { useEffect } from "react";

import { Sidebar } from "@/components/admin/sidebar";
import { AppShell } from "@/components/layout/app-shell";
import { MobileAccountMenu } from "@/components/layout/mobile-account-menu";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";

// Every portal page is a mobile root: the portal navigation is flat, so the
// mobile header never needs a back button.
const MOBILE_ROOT_ROUTES = ["/portal"] as const;

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { principal } = useAuth();
  // 门户仅面向 member（决策九）：admin 与管理员令牌身份没有个人数据
  // 作用域（用户侧接口返回 403），访问门户时送回管理后台。
  const isNonMember = principal !== null && principal.role !== "member";

  useEffect(() => {
    if (isNonMember) {
      router.replace("/dashboard");
    }
  }, [isNonMember, router]);

  if (isNonMember) {
    return null;
  }

  return (
    <AppShell
      sidebar={({ collapsed, onToggleCollapse }) => (
        <Sidebar collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      )}
      mobileRootRoutes={MOBILE_ROOT_ROUTES}
      getMobileBackHref={() => "/portal"}
      mobileHeaderRight={<MobileAccountMenu />}
    >
      {children}
    </AppShell>
  );
}
