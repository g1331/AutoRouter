// @vitest-environment node

import { describe, it, expect } from "vitest";

import { escapeLikePattern } from "@/lib/db/sql-helpers";

describe("escapeLikePattern", () => {
  it("escapes percent, underscore, and backslash", () => {
    expect(escapeLikePattern("50%off")).toBe("50\\%off");
    expect(escapeLikePattern("john_doe")).toBe("john\\_doe");
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });

  it("escapes backslash before wildcards so sequences stay literal", () => {
    // A trailing backslash must not swallow the closing % of the pattern.
    expect(escapeLikePattern("claude\\")).toBe("claude\\\\");
    expect(escapeLikePattern("\\%")).toBe("\\\\\\%");
  });

  it("leaves plain strings untouched", () => {
    expect(escapeLikePattern("gpt-4.1")).toBe("gpt-4.1");
    expect(escapeLikePattern("")).toBe("");
  });
});
