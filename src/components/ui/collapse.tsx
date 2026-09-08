"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface CollapseProps {
  open: boolean;
  children: ReactNode | (() => ReactNode);
  id?: string;
  className?: string;
  style?: CSSProperties;
  onExited?: () => void;
}

/** 按真实高度衔接展开、反向与异步内容；退出期间立即停止焦点和点击。 */
export function Collapse({ open, children, id, className, style, onExited }: CollapseProps) {
  const [present, setPresent] = useState(open);
  const container = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const exiting = useRef(onExited);
  const height = useRef(0);
  useLayoutEffect(() => {
    exiting.current = onExited;
  });

  if (open && !present) setPresent(true);

  useLayoutEffect(() => {
    const element = container.current;
    const inner = content.current;
    if (!element || !inner || !present) return;
    let cancelled = false;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!open && element.contains(document.activeElement)) {
      const trigger = id
        ? document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(id)}"]`)
        : null;
      trigger?.focus();
    }

    const resize = () => {
      const from = animation.current ? element.getBoundingClientRect().height : height.current;
      animation.current?.cancel();
      const to = open ? inner.getBoundingClientRect().height : 0;
      height.current = to;
      const finish = () => {
        if (cancelled) return;
        element.style.height = open ? "auto" : "0px";
        element.style.overflow = open ? "visible" : "hidden";
        animation.current = null;
        if (!open) {
          setPresent(false);
          exiting.current?.();
        }
      };
      if (media.matches || typeof element.animate !== "function" || from === to) {
        finish();
        return;
      }
      element.style.height = `${to}px`;
      element.style.overflow = "hidden";
      const styles = getComputedStyle(document.documentElement);
      const token = styles.getPropertyValue("--vr-motion-normal").trim();
      const duration = token ? parseFloat(token) * (token.endsWith("ms") ? 1 : 1000) : 220;
      const motion = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
        duration,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
      animation.current = motion;
      motion.onfinish = finish;
    };
    resize();
    const observer = new ResizeObserver(() => {
      if (open && inner.getBoundingClientRect().height !== height.current) resize();
    });
    observer.observe(inner);
    media.addEventListener("change", resize);
    return () => {
      cancelled = true;
      height.current = element.getBoundingClientRect().height;
      animation.current?.cancel();
      animation.current = null;
      observer.disconnect();
      media.removeEventListener("change", resize);
    };
  }, [open, present, id]);

  return (
    <div ref={container} id={id} style={style} hidden={!present} inert={!open} aria-hidden={!open}>
      {present && (
        <div ref={content} className={cn("flow-root min-w-0", className)}>
          {typeof children === "function" ? children() : children}
        </div>
      )}
    </div>
  );
}
