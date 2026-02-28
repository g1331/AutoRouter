"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft } from "lucide-react";

import { Sidebar } from "@/components/admin/sidebar";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";

const MOBILE_ROOT_ROUTES = ["/dashboard", "/keys", "/upstreams", "/logs", "/settings"] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const tCommon = useTranslations("common");
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

  useEffect(() => {
    const proto = Element.prototype;
    const originalReleasePointerCapture = proto.releasePointerCapture;
    if (typeof originalReleasePointerCapture !== "function") {
      return;
    }

    proto.releasePointerCapture = function releasePointerCaptureSafe(pointerId: number) {
      try {
        if (typeof this.hasPointerCapture === "function" && !this.hasPointerCapture(pointerId)) {
          return;
        }
        return originalReleasePointerCapture.call(this, pointerId);
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") {
          return;
        }
        throw error;
      }
    };

    return () => {
      proto.releasePointerCapture = originalReleasePointerCapture;
    };
  }, []);

  const isMobileRootRoute = MOBILE_ROOT_ROUTES.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`)
  );
  const mobileBackHref = pathname.startsWith("/system/")
    ? "/settings"
    : (() => {
        const segments = pathname.split("/").filter(Boolean);
        if (segments.length <= 1) {
          return "/dashboard";
        }
        return `/${segments[0]}`;
      })();

  const handleMobileBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(mobileBackHref);
  };

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
        {!isMobileRootRoute && (
          <header className="sticky top-0 z-20 border-b border-divider bg-surface-200/88 backdrop-blur md:hidden">
            <div className="flex h-12 items-center gap-2 px-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground hover:text-foreground"
                onClick={handleMobileBack}
                aria-label={tCommon("back")}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                {tCommon("back")}
              </Button>
            </div>
          </header>
        )}
        {children}
      </main>
    </div>
  );
}
