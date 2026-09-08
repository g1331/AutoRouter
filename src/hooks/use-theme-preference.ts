"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

let finishCurrentTransition: (() => void) | undefined;

/** 所有偏好入口共用颜色过渡；连续选择先清理上一次，不叠加遮罩。 */
export function useThemePreference() {
  const theme = useTheme();
  const cleanup = useRef<(() => void) | undefined>(undefined);

  useEffect(() => () => cleanup.current?.(), []);

  const setTheme = (value: string) => {
    finishCurrentTransition?.();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const root = document.documentElement;
      root.classList.add("theme-switching");
      const finish = () => {
        window.clearTimeout(timer);
        if (finishCurrentTransition === finish) {
          root.classList.remove("theme-switching");
          finishCurrentTransition = undefined;
        }
      };
      const timer = window.setTimeout(finish, 320);
      finishCurrentTransition = finish;
      cleanup.current = finish;
    }
    theme.setTheme(value);
  };

  return { ...theme, setTheme };
}
