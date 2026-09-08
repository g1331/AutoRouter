import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Collapse } from "@/components/ui/collapse";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("关闭的内容不挂载，无动画能力时仍可展开收起", () => {
  const { rerender } = render(
    <Collapse open={false}>
      <button>内容</button>
    </Collapse>
  );
  expect(screen.queryByText("内容")).not.toBeInTheDocument();
  rerender(
    <Collapse open>
      <button>内容</button>
    </Collapse>
  );
  expect(screen.getByText("内容")).toBeVisible();
  rerender(
    <Collapse open={false}>
      <button>内容</button>
    </Collapse>
  );
  expect(screen.queryByText("内容")).not.toBeInTheDocument();
});

describe("真实高度与退出存在期", () => {
  it("异步内容按新高度重定向，运行中减少动态效果立即收敛并清理观察器", () => {
    let resize: () => void = () => {};
    let mediaChange: () => void = () => {};
    let contentHeight = 120;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      }
    );
    const media = {
      matches: false,
      addEventListener: (_: string, callback: () => void) => {
        mediaChange = callback;
      },
      removeEventListener: vi.fn(),
    };
    vi.spyOn(window, "matchMedia").mockReturnValue(media as unknown as MediaQueryList);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement
    ) {
      return { height: this.classList.contains("flow-root") ? contentHeight : 60 } as DOMRect;
    });
    const motions: Array<{ onfinish: (() => void) | null; cancel: ReturnType<typeof vi.fn> }> = [];
    const animate = vi.fn(() => {
      const motion = { onfinish: null, cancel: vi.fn() };
      motions.push(motion);
      return motion;
    });
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    const { container, unmount } = render(
      <Collapse open>
        <p>异步详情</p>
      </Collapse>
    );
    contentHeight = 320;
    act(() => resize());
    expect(motions[0].cancel).toHaveBeenCalledOnce();
    expect(animate.mock.calls.at(-1)?.[0]).toEqual([{ height: "60px" }, { height: "320px" }]);
    act(() => {
      media.matches = true;
      mediaChange();
    });
    expect(motions.at(-1)?.cancel).toHaveBeenCalledOnce();
    expect(container.firstElementChild).toHaveStyle({ height: "auto", overflow: "visible" });
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(media.removeEventListener).toHaveBeenCalledOnce();
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });
  it("关闭立即 inert，反向取消旧退出，卸载清理动画", () => {
    const motions: Array<{ onfinish: (() => void) | null; cancel: ReturnType<typeof vi.fn> }> = [];
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: 160,
    } as DOMRect);
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: vi.fn(() => {
        const motion = { onfinish: null, cancel: vi.fn() };
        motions.push(motion);
        return motion;
      }),
    });
    const exited = vi.fn();
    const { rerender, container, unmount } = render(
      <Collapse open onExited={exited}>
        <button>内容</button>
      </Collapse>
    );
    act(() => motions[0].onfinish?.());
    rerender(
      <Collapse open={false} onExited={exited}>
        <button>内容</button>
      </Collapse>
    );
    expect(container.firstElementChild).toHaveAttribute("inert");
    expect(screen.getByText("内容")).toBeInTheDocument();
    const exit = motions.at(-1)!;
    rerender(
      <Collapse open onExited={exited}>
        <button>内容</button>
      </Collapse>
    );
    expect(exit.cancel).toHaveBeenCalled();
    act(() => exit.onfinish?.());
    expect(exited).not.toHaveBeenCalled();
    expect(container.firstElementChild).not.toHaveAttribute("inert");
    unmount();
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });
});
