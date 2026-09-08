"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/** 快照等待实际路由提交；慢导航释放快照，路由和请求始终由 Next 驱动。 */
export function usePageTransition(pathname: string, authenticated: boolean) {
  const pending = useRef<{ resolve: () => void; cancel: () => void } | null>(null);

  useLayoutEffect(() => {
    if (!authenticated) pending.current?.cancel();
    else pending.current?.resolve();
  }, [pathname, authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const start = (href: string) => {
      pending.current?.cancel();
      const url = new URL(href, window.location.href);
      const target = url.pathname.replace(/^\/(en|zh-CN)(?=\/|$)/, "") || "/";
      const member = pathname.startsWith("/portal");
      if (
        media.matches ||
        !document.startViewTransition ||
        url.origin !== window.location.origin ||
        target === pathname ||
        target === "/" ||
        target === "/login" ||
        member !== target.startsWith("/portal")
      )
        return;

      const root = document.documentElement;
      root.dataset.pageTransition = target.startsWith(`${pathname}/`)
        ? "forward"
        : pathname.startsWith(`${target}/`)
          ? "back"
          : "peer";
      let resolve!: () => void;
      const committed = new Promise<void>((done) => {
        resolve = done;
      });
      let transition: ViewTransition;
      const finish = () => {
        window.clearTimeout(timer);
        if (pending.current?.cancel === cancel) {
          delete root.dataset.pageTransition;
          pending.current = null;
        }
      };
      const cancel = () => {
        resolve();
        transition?.skipTransition();
        finish();
      };
      // 只限制旧快照寿命，不延迟导航；慢页面继续显示其真实加载状态。
      const timer = window.setTimeout(cancel, 300);
      pending.current = { resolve, cancel };
      try {
        transition = document.startViewTransition(() => committed);
        void transition.ready.catch(() => undefined);
        void transition.finished.then(finish, finish);
      } catch {
        cancel();
      }
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element)?.closest<HTMLAnchorElement>("a[href]");
      if (link && !link.hasAttribute("download") && (!link.target || link.target === "_self"))
        start(link.href);
    };
    const pop = () => start(window.location.href);
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const traverse = (event: Event) => {
      const change = event as Event & { navigationType?: string; destination?: { url: string } };
      if (change.navigationType === "traverse" && change.destination) start(change.destination.url);
    };
    const reduce = () => {
      if (media.matches) pending.current?.cancel();
    };
    document.addEventListener("click", click, true);
    if (navigation) navigation.addEventListener("navigate", traverse);
    else window.addEventListener("popstate", pop);
    media.addEventListener("change", reduce);
    return () => {
      document.removeEventListener("click", click, true);
      if (navigation) navigation.removeEventListener("navigate", traverse);
      else window.removeEventListener("popstate", pop);
      media.removeEventListener("change", reduce);
      // 提交后的动画可继续；未提交或登出由 layout effect / 下次 start 清理。
    };
  }, [pathname, authenticated]);

  useLayoutEffect(() => () => pending.current?.cancel(), []);
}
