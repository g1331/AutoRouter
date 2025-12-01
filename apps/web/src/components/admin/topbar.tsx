"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useAuth } from "@/providers/auth-provider";

interface TopbarProps {
  title: string;
}

/**
 * M3 Top App Bar
 */
export function Topbar({ title }: TopbarProps) {
  const { logout } = useAuth();

  return (
    <header className="sticky top-0 z-20 w-full bg-[rgb(var(--md-sys-color-surface)_/_0.95)] backdrop-blur-md border-b border-[rgb(var(--md-sys-color-outline-variant))]">
      <div className="flex items-center justify-between h-16 px-6">
        {/* Page Title */}
        <h1 className="type-title-large text-[rgb(var(--md-sys-color-on-surface))]">
          {title}
        </h1>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <ThemeToggle />

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-10 gap-2 rounded-[var(--shape-corner-full)] hover:bg-[rgb(var(--md-sys-color-on-surface)_/_0.08)] transition-colors"
                aria-label="用户菜单"
              >
                <div className="w-8 h-8 rounded-[var(--shape-corner-full)] bg-[rgb(var(--md-sys-color-primary-container))] flex items-center justify-center">
                  <span className="type-label-large text-[rgb(var(--md-sys-color-on-primary-container))]">
                    A
                  </span>
                </div>
                <span className="hidden sm:inline type-label-large text-[rgb(var(--md-sys-color-on-surface-variant))]">
                  Admin
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={logout}
                className="gap-2 cursor-pointer text-[rgb(var(--md-sys-color-error))] focus:text-[rgb(var(--md-sys-color-error))] focus:bg-[rgb(var(--md-sys-color-error-container))]"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>登出</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
