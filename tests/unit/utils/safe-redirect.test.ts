import { describe, expect, it } from "vitest";
import { sanitizeRedirect } from "@/lib/utils/safe-redirect";

const FALLBACK = "/dashboard";

describe("sanitizeRedirect", () => {
  it("returns the fallback when the value is absent or empty", () => {
    expect(sanitizeRedirect(null, FALLBACK)).toBe(FALLBACK);
    expect(sanitizeRedirect(undefined, FALLBACK)).toBe(FALLBACK);
    expect(sanitizeRedirect("", FALLBACK)).toBe(FALLBACK);
  });

  it("accepts a same-site absolute path (with query)", () => {
    expect(sanitizeRedirect("/portal/keys", FALLBACK)).toBe("/portal/keys");
    expect(sanitizeRedirect("/dashboard?focus=1", FALLBACK)).toBe("/dashboard?focus=1");
  });

  it("rejects an absolute URL carrying a scheme", () => {
    expect(sanitizeRedirect("https://evil.com", FALLBACK)).toBe(FALLBACK);
    expect(sanitizeRedirect("http://evil.com/path", FALLBACK)).toBe(FALLBACK);
    expect(sanitizeRedirect("javascript:alert(1)", FALLBACK)).toBe(FALLBACK);
  });

  it("rejects a protocol-relative URL", () => {
    expect(sanitizeRedirect("//evil.com", FALLBACK)).toBe(FALLBACK);
  });

  it("rejects backslash- and whitespace-tricked targets that browsers fold to //host", () => {
    expect(sanitizeRedirect("/\\evil.com", FALLBACK)).toBe(FALLBACK);
    expect(sanitizeRedirect("/\t//evil.com", FALLBACK)).toBe(FALLBACK);
  });

  it("rejects a value not rooted at a single slash", () => {
    expect(sanitizeRedirect("evil.com", FALLBACK)).toBe(FALLBACK);
    expect(sanitizeRedirect("\\\\evil.com", FALLBACK)).toBe(FALLBACK);
  });
});
