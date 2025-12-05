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
    label: "DASHBOARD",
  },
  { name: "Keys", href: "/keys", icon: Key, label: "API KEYS" },
  { name: "Upstreams", href: "/upstreams", icon: Server, label: "UPSTREAMS" },
];

/**
 * Cassette Futurism Sidebar Navigation
 *
 * Terminal-style navigation with:
 * - Deep black background
 * - Amber text and icons
 * - Left border indicator for active state
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="flex flex-col h-full w-16 lg:w-56 bg-black-900 border-r border-divider-subtle"
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Logo & Brand */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-divider-subtle overflow-hidden">
        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-amber-500 text-black-900 rounded-cf-sm">
          <svg
            className="w-6 h-6"
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
          <span className="font-mono text-sm font-medium text-amber-500 tracking-wide truncate cf-glow-text">
            AUTOROUTER
          </span>
          <span className="font-mono text-xs text-amber-700 truncate">
            ADMIN v1.0
          </span>
        </div>
      </div>

      {/* Navigation Destinations */}
      <nav className="flex-1 py-4 space-y-1" aria-label="Main menu">
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
                "flex items-center gap-3 px-3 py-3 mx-2 rounded-cf-sm",
                "font-mono text-xs font-medium tracking-wider",
                "border-l-2 border-transparent",
                "transition-all duration-cf-normal ease-cf-standard",
                isActive
                  ? "bg-surface-300 text-amber-500 border-l-amber-500 shadow-cf-glow-subtle"
                  : "text-amber-700 hover:bg-surface-400 hover:text-amber-500 hover:border-l-amber-700"
              )}
              aria-current={isActive ? "page" : undefined}
              title={item.label}
            >
              <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
              <span className="hidden lg:inline flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Version Info */}
      <div className="px-3 py-4 border-t border-divider-subtle">
        <p className="font-mono text-xs text-amber-700 text-center lg:text-left">
          SYS::OK
        </p>
      </div>
    </aside>
  );
}
