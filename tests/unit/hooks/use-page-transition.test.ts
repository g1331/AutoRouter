import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePageTransition } from "@/hooks/use-page-transition";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  document.body.replaceChildren();
});

describe("路由快照生命周期", () => {
  it("等待实际提交，慢导航和认证失效立即释放，不驱动第二次导航", async () => {
    vi.useFakeTimers();
    const skip = vi.fn();
    let committed: Promise<void> | undefined;
    document.startViewTransition = vi.fn((update: () => Promise<void>) => {
      committed = update();
      return {
        ready: Promise.resolve(),
        finished: new Promise(() => {}),
        updateCallbackDone: committed,
        skipTransition: skip,
      };
    }) as typeof document.startViewTransition;
    const anchor = document.createElement("a");
    anchor.href = "/en/keys";
    anchor.addEventListener("click", (event) => event.preventDefault());
    document.body.append(anchor);
    const { rerender, unmount } = renderHook(({ path, auth }) => usePageTransition(path, auth), {
      initialProps: { path: "/dashboard", auth: true },
    });
    act(() => fireEvent.click(anchor));
    let resolved = false;
    void committed?.then(() => {
      resolved = true;
    });
    await act(async () => {});
    expect(resolved).toBe(false);
    rerender({ path: "/keys", auth: true });
    await act(async () => {});
    expect(resolved).toBe(true);
    anchor.href = "/en/logs";
    act(() => fireEvent.click(anchor));
    act(() => vi.advanceTimersByTime(300));
    expect(document.documentElement).not.toHaveAttribute("data-page-transition");
    act(() => fireEvent.click(anchor));
    rerender({ path: "/keys", auth: false });
    expect(document.documentElement).not.toHaveAttribute("data-page-transition");
    expect(skip).toHaveBeenCalled();
    unmount();
  });
});
