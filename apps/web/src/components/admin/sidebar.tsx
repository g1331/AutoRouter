"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Key, Server } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    label: "控制台",
  },
  { name: "Keys", href: "/keys", icon: Key, label: "密钥" },
  { name: "Upstreams", href: "/upstreams", icon: Server, label: "上游" },
];

/**
 * M3 Navigation Rail / Drawer
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="navigation-rail" role="navigation" aria-label="主导航">
      {/* Logo & Brand */}
      <div className="flex items-center gap-3 px-2 overflow-hidden">
        <div className="navigation-rail__logo-mark flex-shrink-0">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <div className="hidden lg:flex flex-col flex-1 min-w-0">
          <span className="type-title-small text-[rgb(var(--sidebar-foreground))] truncate">
            AutoRouter
          </span>
          <span className="type-body-small text-[rgb(var(--sidebar-foreground)_/_0.6)] truncate">
            Admin Console
          </span>
        </div>
      </div>

      {/* Navigation Destinations */}
      <nav className="navigation-rail__destinations" aria-label="主导航菜单">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname?.startsWith(item.href + "/"));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "navigation-rail__item",
                isActive && "navigation-rail__item--active"
              )}
              aria-current={isActive ? "page" : undefined}
              title={item.label}
            >
              <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
              <span className="hidden lg:inline flex-1 type-label-large">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Version Info */}
      <div className="navigation-rail__version">
        <p className="type-label-small">v1.0.0</p>
      </div>
    </aside>
  );
}
