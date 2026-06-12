"use client";

import { Sidebar } from "@/components/admin/sidebar";
import { AppShell } from "@/components/layout/app-shell";

// Every portal page is a mobile root: the portal navigation is flat, so the
// mobile header never needs a back button.
const MOBILE_ROOT_ROUTES = ["/portal"] as const;

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      sidebar={({ collapsed, onToggleCollapse }) => (
        <Sidebar collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      )}
      mobileRootRoutes={MOBILE_ROOT_ROUTES}
      getMobileBackHref={() => "/portal"}
    >
      {children}
    </AppShell>
  );
}
