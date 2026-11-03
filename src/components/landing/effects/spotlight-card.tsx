"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import styles from "../landing.module.css";

/** 指针在卡片上移动时，一团暖光和一段描边跟随指针。 */
export function SpotlightCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const handleMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const element = ref.current;
    if (!element) return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      element.style.setProperty("--x", `${clientX - rect.left}px`);
      element.style.setProperty("--y", `${clientY - rect.top}px`);
    });
  };

  return (
    <div ref={ref} onPointerMove={handleMove} className={cn(styles.spotlight, className)}>
      {children}
    </div>
  );
}
