"use client";

import * as React from "react";
import { flushSync } from "react-dom";

/**
 * 容器变形（container transform）动画 hook。
 *
 * 基于浏览器原生 View Transitions API（`document.startViewTransition`），
 * 让弹窗从触发它的源元素（卡片 / 按钮）「变形」展开、关闭时再「收」回该元素，
 * 类似手机上点开应用图标展开成全屏的效果。不依赖任何 JS 动画库。
 *
 * 核心约束是 `view-transition-name` 的快照时序唯一性：
 * `startViewTransition(cb)` 在调用瞬间捕获「旧」快照、在 cb 执行完捕获「新」快照，
 * 同一帧里每个 name 必须唯一。弹窗的 name 由 `DialogContent` 渲染时自带，
 * 源元素的 name 由本 hook 临时挂载，两者不能在同一帧同时带同名，
 * 因此 enter / exit 两个方向需要分别编排 name 的设置时机（见 startMorph）。
 */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const VIEW_TRANSITION_NAME_PROPERTY = "view-transition-name";

/** 浏览器原生 ViewTransition 的最小子集，避免依赖 TS DOM lib 版本。 */
interface ViewTransitionLike {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition(): void;
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => ViewTransitionLike;
};

function subscribeToReducedMotion(callback: () => void) {
  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/** enter：源元素 → 弹窗；exit：弹窗 → 源元素。 */
export type MorphMode = "enter" | "exit";

export interface StartMorphOptions {
  /** enter 时为触发弹窗的源元素、exit 时为收回的目标元素（通常是同一张卡片 / 同一个按钮）。 */
  source?: HTMLElement | null;
  /** 与目标弹窗 `DialogContent` 的 `morphName` 一致的 `view-transition-name`。 */
  name: string;
  /** 决定 name 在 `startViewTransition` 回调内外的设置时机。 */
  mode: MorphMode;
}

export function useContainerMorph() {
  const prefersReducedMotion = React.useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getServerSnapshot
  );

  // 记录当前临时挂了 view-transition-name 的源元素，确保任何出口都能清理，杜绝 name 泄漏。
  const taggedElementRef = React.useRef<HTMLElement | null>(null);

  const clearSourceName = React.useCallback(() => {
    const element = taggedElementRef.current;
    if (element) {
      element.style.removeProperty(VIEW_TRANSITION_NAME_PROPERTY);
      taggedElementRef.current = null;
    }
  }, []);

  const setSourceName = React.useCallback(
    (source: HTMLElement | null | undefined, name: string) => {
      clearSourceName();
      if (source) {
        source.style.setProperty(VIEW_TRANSITION_NAME_PROPERTY, name);
        taggedElementRef.current = source;
      }
    },
    [clearSourceName]
  );

  const canMorph =
    !prefersReducedMotion &&
    typeof document !== "undefined" &&
    typeof (document as DocumentWithViewTransition).startViewTransition === "function";

  const startMorph = React.useCallback(
    (apply: () => void, options: StartMorphOptions) => {
      const doc = typeof document !== "undefined" ? (document as DocumentWithViewTransition) : null;

      // 不支持 View Transitions 或用户偏好减少动态效果：直接同步应用，无动画。
      if (!doc?.startViewTransition || prefersReducedMotion) {
        apply();
        return;
      }

      const { source, name, mode } = options;

      if (mode === "enter") {
        // enter：旧快照里只有源元素带 name（弹窗尚未挂载）。
        setSourceName(source, name);
      } else {
        // exit：旧快照里 name 在弹窗上，源元素此刻不能带同名，先清掉任何残留。
        clearSourceName();
      }

      const transition = doc.startViewTransition(() => {
        flushSync(apply);
        // flushSync 之后、新快照之前，把 name 调整到正确的一端：
        if (mode === "enter") {
          // 弹窗已挂载并自带 name；源元素必须放弃 name，避免新快照里出现双 name。
          clearSourceName();
        } else {
          // 弹窗已卸载（name 随之消失）；把 name 交给源元素作为新快照端点。
          setSourceName(source, name);
        }
      });

      transition.finished.finally(() => {
        clearSourceName();
      });
    },
    [clearSourceName, prefersReducedMotion, setSourceName]
  );

  // 组件卸载时兜底清理。
  React.useEffect(() => clearSourceName, [clearSourceName]);

  return { startMorph, canMorph } as const;
}
