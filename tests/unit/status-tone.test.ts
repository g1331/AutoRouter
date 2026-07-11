import { describe, expect, it } from "vitest";

import { statusTone, type StatusTone } from "@/lib/status-tone";

const TONES: StatusTone[] = ["success", "warning", "error", "info"];

describe("statusTone", () => {
  it.each(TONES)("soft %s 输出 border/bg/text 三连且同色", (tone) => {
    const classes = statusTone(tone);
    expect(classes).toBe(`border-status-${tone}/40 bg-status-${tone}-muted text-status-${tone}`);
  });

  it.each(TONES)("faint %s 输出低强度三连且同色", (tone) => {
    const classes = statusTone(tone, "faint");
    expect(classes).toBe(`border-status-${tone}/25 bg-status-${tone}-muted/25 text-status-${tone}`);
  });

  it("默认档位是 soft", () => {
    expect(statusTone("success")).toBe(statusTone("success", "soft"));
  });
});
