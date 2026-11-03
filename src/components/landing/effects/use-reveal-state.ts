"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * 进场状态：idle 为服务端与未水合时的默认值（内容正常可见）；
 * 脚本运行后，首次观测到元素在视口外才切到 hidden，滚入视口时切到 shown。
 *
 * 内容只在「确认脚本在跑且元素看不见」时才被藏起来，脚本加载失败也不会留下空白。
 */
export type RevealState = "idle" | "hidden" | "shown";

export function useRevealState(
  ref: RefObject<Element | null>,
  { threshold = 0.12, rootMargin = "0px 0px -6% 0px" } = {}
): RevealState {
  const [state, setState] = useState<RevealState>("idle");

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let first = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("shown");
          observer.disconnect();
        } else if (first) {
          setState("hidden");
        }
        first = false;
      },
      { threshold, rootMargin }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold, rootMargin]);

  return state;
}
