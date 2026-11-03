"use client";

import { useEffect, useState, type RefObject } from "react";

/** 元素是否在视口内；`once` 为真时首次进入后保持 true（用于进场动画）。 */
export function useInView(
  ref: RefObject<Element | null>,
  { once = false, threshold = 0.2, rootMargin = "0px" } = {}
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, once, threshold, rootMargin]);

  return inView;
}
