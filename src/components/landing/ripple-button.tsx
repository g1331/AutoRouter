"use client";

import * as React from "react";

import { Link, useRouter } from "@/i18n/navigation";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

interface RippleLinkButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  "aria-label"?: string;
}

const NAVIGATE_DELAY_MS = 300;
const RIPPLE_LIFETIME_MS = 620;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 落地页 CTA 按钮：点击坐标处生成 amber 水波纹涟漪。
 *
 * 按钮同时是导航链接，若点击即跳转，承载涟漪的组件会立刻卸载、动画来不及展示，
 * 因此普通左键点击时先播放涟漪、延迟约 300ms 再导航；修饰键点击（新标签页）、
 * 键盘激活（detail===0）与 prefers-reduced-motion 仍走 Link 原生即时导航。
 * 涟漪叠加在按钮背景之上、文字之下，确保在不透明 primary 背景上可见。
 */
export function RippleLinkButton({
  href,
  children,
  variant = "primary",
  size = "lg",
  className,
  "aria-label": ariaLabel,
}: RippleLinkButtonProps) {
  const router = useRouter();
  const [ripples, setRipples] = React.useState<Ripple[]>([]);
  const nextId = React.useRef(0);

  const spawnRipple = React.useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const id = nextId.current++;
    const ripple: Ripple = {
      id,
      size,
      x: event.clientX - rect.left - size / 2,
      y: event.clientY - rect.top - size / 2,
    };
    setRipples((prev) => [...prev, ripple]);
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((item) => item.id !== id));
    }, RIPPLE_LIFETIME_MS);
  }, []);

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      // 修饰键 / 中键 / 键盘激活 / 减少动态效果：交给 Link 原生导航，保留新标签页与无障碍行为。
      if (
        event.button !== 0 ||
        event.detail === 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        prefersReducedMotion()
      ) {
        return;
      }
      event.preventDefault();
      spawnRipple(event);
      window.setTimeout(() => router.push(href), NAVIGATE_DELAY_MS);
    },
    [router, href, spawnRipple]
  );

  return (
    <Button asChild variant={variant} size={size}>
      <Link
        href={href}
        aria-label={ariaLabel}
        onClick={handleClick}
        className={cn("relative isolate overflow-hidden", className)}
      >
        <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
        <span className="pointer-events-none absolute inset-0" aria-hidden="true">
          {ripples.map((ripple) => (
            <span
              key={ripple.id}
              className="animate-ripple absolute rounded-full bg-[rgb(255_255_255_/_0.45)]"
              style={{
                left: ripple.x,
                top: ripple.y,
                width: ripple.size,
                height: ripple.size,
              }}
            />
          ))}
        </span>
      </Link>
    </Button>
  );
}
