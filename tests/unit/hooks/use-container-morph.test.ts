import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContainerMorph } from "@/hooks/use-container-morph";

const NAME_PROP = "view-transition-name";

type StartViewTransition = (callback: () => void) => {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition: () => void;
};

interface DocumentWithViewTransition extends Document {
  startViewTransition?: StartViewTransition;
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** 注入一个同步执行回调的 startViewTransition 桩，返回该桩的 spy。 */
function stubViewTransition(finished: Promise<void> = Promise.resolve()) {
  const start = vi.fn((callback: () => void) => {
    callback();
    return {
      finished,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      skipTransition: vi.fn(),
    };
  });
  (document as DocumentWithViewTransition).startViewTransition = start as StartViewTransition;
  return start;
}

describe("useContainerMorph", () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    delete (document as DocumentWithViewTransition).startViewTransition;
    vi.restoreAllMocks();
  });

  function setReducedMotion(matches: boolean) {
    window.matchMedia = ((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  it("无 startViewTransition 时降级为同步执行，且不残留 view-transition-name", () => {
    // jsdom 默认没有 document.startViewTransition
    const { result } = renderHook(() => useContainerMorph());
    expect(result.current.canMorph).toBe(false);

    const source = document.createElement("div");
    const apply = vi.fn();
    act(() => {
      result.current.startMorph(apply, { source, name: "morph-test", mode: "enter" });
    });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(source.style.getPropertyValue(NAME_PROP)).toBe("");
  });

  it("enter：调用 startViewTransition 并应用变更，新快照前已清除源元素 name", () => {
    const start = stubViewTransition();
    const { result } = renderHook(() => useContainerMorph());
    expect(result.current.canMorph).toBe(true);

    const source = document.createElement("div");
    const apply = vi.fn();
    act(() => {
      result.current.startMorph(apply, { source, name: "morph-test", mode: "enter" });
    });

    expect(start).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
    // enter 下弹窗挂载后自带 name，源元素必须在新快照前放弃 name，避免双 name 冲突。
    expect(source.style.getPropertyValue(NAME_PROP)).toBe("");
  });

  it("exit：回调执行后源元素带 name 作为新快照端点，finished 后清除", async () => {
    const deferred = createDeferred();
    const start = stubViewTransition(deferred.promise);
    const { result } = renderHook(() => useContainerMorph());

    const source = document.createElement("div");
    const apply = vi.fn();
    act(() => {
      result.current.startMorph(apply, { source, name: "morph-test", mode: "exit" });
    });

    expect(start).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
    // finished 尚未 resolve：exit 下源元素应带 name（弹窗已卸载，name 交给源元素）。
    expect(source.style.getPropertyValue(NAME_PROP)).toBe("morph-test");

    await act(async () => {
      deferred.resolve();
    });
    await waitFor(() => expect(source.style.getPropertyValue(NAME_PROP)).toBe(""));
  });

  it("reduced-motion 时 canMorph 为 false 且跳过 View Transition", () => {
    setReducedMotion(true);
    const start = stubViewTransition();
    const { result } = renderHook(() => useContainerMorph());
    expect(result.current.canMorph).toBe(false);

    const source = document.createElement("div");
    const apply = vi.fn();
    act(() => {
      result.current.startMorph(apply, { source, name: "morph-test", mode: "enter" });
    });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    expect(source.style.getPropertyValue(NAME_PROP)).toBe("");
  });

  it("快速反向时旧回调不覆盖新意图，旧完成不清除新命名", async () => {
    const callbacks: Array<() => void> = [];
    const completions = [createDeferred(), createDeferred()];
    const skips = [vi.fn(), vi.fn()];
    let index = 0;
    (document as DocumentWithViewTransition).startViewTransition = (callback) => {
      callbacks.push(callback);
      const current = index++;
      return {
        finished: completions[current].promise,
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: skips[current],
      };
    };
    const { result, unmount } = renderHook(() => useContainerMorph());
    const source = document.createElement("button");
    const oldApply = vi.fn();
    const newApply = vi.fn();
    act(() => {
      result.current.startMorph(oldApply, { source, name: "old", mode: "enter" });
      result.current.startMorph(newApply, { source, name: "new", mode: "exit" });
      callbacks[0]();
      callbacks[1]();
    });
    expect(oldApply).not.toHaveBeenCalled();
    expect(newApply).toHaveBeenCalledOnce();
    expect(skips[0]).toHaveBeenCalledOnce();
    await act(async () => completions[0].resolve());
    expect(source.style.getPropertyValue(NAME_PROP)).toBe("new");
    unmount();
    expect(skips[1]).toHaveBeenCalledOnce();
    expect(source.style.getPropertyValue(NAME_PROP)).toBe("");
    await act(async () => completions[1].resolve());
  });

  it("动画 API 抛错仍执行操作一次，业务错误不被吞掉", () => {
    (document as DocumentWithViewTransition).startViewTransition = () => {
      throw new DOMException("unavailable");
    };
    const { result } = renderHook(() => useContainerMorph());
    const apply = vi.fn();
    act(() => result.current.startMorph(apply, { name: "test", mode: "enter" }));
    expect(apply).toHaveBeenCalledOnce();
    stubViewTransition();
    expect(() =>
      result.current.startMorph(
        () => {
          throw new Error("business failure");
        },
        { name: "test", mode: "enter" }
      )
    ).toThrow("business failure");
  });

  it("源节点移除后仍提交操作，业务回调异步失败会报告且完成后清理", async () => {
    const failure = new Error("save failed");
    const report = vi.fn();
    vi.stubGlobal("reportError", report);
    const finished = createDeferred();
    const source = document.createElement("button");
    document.body.append(source);
    (document as DocumentWithViewTransition).startViewTransition = (callback) => {
      source.remove();
      let updateCallbackDone: Promise<void>;
      try {
        callback();
        updateCallbackDone = Promise.resolve();
      } catch (error) {
        updateCallbackDone = Promise.reject(error);
      }
      return {
        ready: Promise.reject(new DOMException("missing source")),
        updateCallbackDone,
        finished: finished.promise,
        skipTransition: vi.fn(),
      };
    };
    const { result } = renderHook(() => useContainerMorph());
    await act(async () =>
      result.current.startMorph(
        () => {
          throw failure;
        },
        { source, name: "missing", mode: "enter" }
      )
    );
    expect(report).toHaveBeenCalledExactlyOnceWith(failure);
    await act(async () => finished.resolve());
    expect(source.style.getPropertyValue(NAME_PROP)).toBe("");
    vi.unstubAllGlobals();
  });
});
