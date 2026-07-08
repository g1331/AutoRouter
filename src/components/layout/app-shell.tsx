"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft } from "lucide-react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";

interface AppShellProps {
  // Sidebar render prop: the shell owns the collapsed state, the route group
  // decides which navigation set to render.
  sidebar: (props: { collapsed: boolean; onToggleCollapse: () => void }) => React.ReactNode;
  // Routes treated as mobile roots (no back button in the mobile header).
  mobileRootRoutes: readonly string[];
  // Fallback target for the mobile back button when there is no history.
  getMobileBackHref: (pathname: string) => string;
  // Optional center slot of the mobile header (the dashboard mounts its pulse strip here).
  mobileHeaderCenter?: React.ReactNode;
  // Optional right slot of the mobile header (the portal mounts its account menu here).
  mobileHeaderRight?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shared authenticated app shell used by both the admin dashboard and the
 * member portal route groups. It owns the auth guard, the sidebar collapse
 * state, and the mobile header frame; route-group-specific concerns (live
 * pulse provider, navigation sets, mobile root routes) stay in each group's
 * layout.
 */
export function AppShell({
  sidebar,
  mobileRootRoutes,
  getMobileBackHref,
  mobileHeaderCenter,
  mobileHeaderRight,
  children,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const tCommon = useTranslations("common");
  const { token } = useAuth();

  const mainRef = useRef<HTMLElement>(null);

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

  // The shell scrolls inside <main>, not the window, so the browser's native
  // scroll restoration never applies — reimplement it: forward navigations
  // start at the top, back/forward (popstate) restores the saved position.
  const scrollPositionsRef = useRef(new Map<string, number>());
  const isPopNavigationRef = useRef(false);

  useEffect(() => {
    // Next drives back/forward through the Navigation API where available and
    // commits the React navigation BEFORE popstate fires, so the flag must be
    // set from the earlier `navigate` event (traverse = back/forward).
    // popstate stays as the fallback for browsers without the API (and jsdom).
    const navigation = (
      window as { navigation?: { addEventListener: EventTarget["addEventListener"] } & EventTarget }
    ).navigation;
    if (navigation) {
      const handleNavigate = (event: Event) => {
        if ((event as { navigationType?: string }).navigationType === "traverse") {
          isPopNavigationRef.current = true;
        }
      };
      navigation.addEventListener("navigate", handleNavigate);
      return () => navigation.removeEventListener("navigate", handleNavigate);
    }
    const handlePopState = () => {
      isPopNavigationRef.current = true;
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) {
      return;
    }
    const handleScroll = () => {
      scrollPositionsRef.current.set(pathname, main.scrollTop);
    };
    main.addEventListener("scroll", handleScroll, { passive: true });
    return () => main.removeEventListener("scroll", handleScroll);
  }, [pathname]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) {
      return;
    }
    if (isPopNavigationRef.current) {
      isPopNavigationRef.current = false;
      const saved = scrollPositionsRef.current.get(pathname) ?? 0;
      // On the commit frame the page content (charts, media) has not laid out
      // yet, so the browser clamps the offset to the shorter height. Retry
      // over the next frames until it sticks or the content never grows tall
      // enough (data not in the query cache — degrade to top).
      let attempts = 10;
      const restore = () => {
        if (!mainRef.current) {
          return;
        }
        mainRef.current.scrollTop = saved;
        if (Math.abs(mainRef.current.scrollTop - saved) > 1 && attempts-- > 0) {
          requestAnimationFrame(restore);
        }
      };
      restore();
      return;
    }
    main.scrollTop = 0;
  }, [pathname]);

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

  const isMobileRootRoute = mobileRootRoutes.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`)
  );

  const handleMobileBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(getMobileBackHref(pathname));
  };

  if (!token) {
    return null;
  }

  return (
    // h-dvh (not min-h-dvh) pins the shell to the viewport so <main> is the
    // real scroll container — required for the sticky topbars to work.
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {sidebar({
        collapsed: isSidebarCollapsed,
        onToggleCollapse: () => setIsSidebarCollapsed((value) => !value),
      })}

      <main
        ref={mainRef}
        className={cn(
          "min-w-0 flex-1 overflow-y-auto transition-[margin] duration-cf-normal ease-cf-standard",
          // Keep programmatic scrollIntoView targets clear of the sticky
          // topbars (h-14 desktop / h-12 mobile) that overlay this container.
          "scroll-pt-14",
          "pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0",
          isSidebarCollapsed ? "md:ml-20" : "md:ml-64"
        )}
      >
        <header className="sticky top-0 z-20 border-b border-divider bg-surface-200/88 backdrop-blur md:hidden">
          <div className="grid h-12 grid-cols-[1fr_auto_1fr] items-center gap-2 px-3">
            <div className="flex min-w-0 items-center">
              {!isMobileRootRoute && (
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
              )}
            </div>
            {mobileHeaderCenter ?? <span aria-hidden="true" />}
            <div className="flex min-w-0 items-center justify-end">
              {mobileHeaderRight ?? <span aria-hidden="true" />}
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
