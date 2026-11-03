"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import styles from "../landing.module.css";
import { useRevealState } from "./use-reveal-state";

interface RevealProps {
  children: ReactNode;
  /** 进场延迟（毫秒），用于同一区块内的错峰。 */
  delay?: number;
  className?: string;
}

/** 滚动进入视口时由模糊下沉过渡到清晰；脚本未运行或减少动态效果时直接显示。 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useRevealState(ref);
  return (
    <div
      ref={ref}
      className={cn(styles.reveal, className)}
      style={{ "--delay": delay } as CSSProperties}
      data-reveal={state}
    >
      {children}
    </div>
  );
}
