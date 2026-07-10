// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { warnIfForbiddenVisualStyle } from "@/lib/utils";

describe("warnIfForbiddenVisualStyle", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  const forbidden = [
    "bg-blue-500",
    "bg-purple-950",
    "bg-indigo-500/40",
    "from-violet-500 to-purple-600",
    "from-blue-300/25",
    "text-blue-500",
    "text-purple-400/80",
    "bg-[#3b82f6]",
    "bg-[rgb(139,92,246)]",
    "p-2 bg-[#8b5cf6]",
  ];

  it.each(forbidden)("warns on forbidden class: %s", (className) => {
    warnIfForbiddenVisualStyle("Test", className);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  const allowed = [
    "bg-surface-300 text-foreground",
    "bg-status-info-muted text-status-info border-status-info",
    "bg-amber-500 text-black-900",
    "bg-blue-200",
    "text-muted-foreground",
    "bg-[var(--vr-surface-2)]",
    "rounded-cf-sm border-divider",
  ];

  it.each(allowed)("does not warn on allowed class: %s", (className) => {
    warnIfForbiddenVisualStyle("Test", className);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does nothing when className is undefined", () => {
    warnIfForbiddenVisualStyle("Test", undefined);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
