import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useThemePreference } from "@/hooks/use-theme-preference";

const { setTheme } = vi.hoisted(() => ({ setTheme: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme: () => ({ setTheme, theme: "system" }) }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("多个入口连续选择只保留最新过渡，卸载与减少动态效果清除临时样式", () => {
  vi.useFakeTimers();
  const first = renderHook(useThemePreference);
  const second = renderHook(useThemePreference);
  act(() => first.result.current.setTheme("light"));
  expect(document.documentElement).toHaveClass("theme-switching");
  act(() => second.result.current.setTheme("dark"));
  first.unmount();
  expect(document.documentElement).toHaveClass("theme-switching");
  act(() => vi.advanceTimersByTime(320));
  expect(document.documentElement).not.toHaveClass("theme-switching");
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  act(() => second.result.current.setTheme("system"));
  expect(setTheme).toHaveBeenLastCalledWith("system");
  expect(document.documentElement).not.toHaveClass("theme-switching");
  second.unmount();
});
