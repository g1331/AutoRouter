import { describe, it, expect } from "vitest";

import {
  formatPriceNumber,
  getBillingTaskStatusLabel,
  getSyncBadgeVariant,
  parseOptionalPrice,
  parsePositiveInt,
  parseRequiredPrice,
} from "@/components/admin/billing/billing-format";

describe("billing-format pure functions", () => {
  describe("parseRequiredPrice", () => {
    it("parses a valid non-negative number", () => {
      expect(parseRequiredPrice("1.5")).toBe(1.5);
      expect(parseRequiredPrice("0")).toBe(0);
    });

    it("rejects empty / whitespace-only input", () => {
      expect(parseRequiredPrice("")).toBeNull();
      expect(parseRequiredPrice("   ")).toBeNull();
    });

    it("rejects non-numeric input", () => {
      expect(parseRequiredPrice("abc")).toBeNull();
    });

    it("rejects negative numbers", () => {
      expect(parseRequiredPrice("-1")).toBeNull();
    });
  });

  describe("parseOptionalPrice", () => {
    it("returns null for empty / whitespace-only input", () => {
      expect(parseOptionalPrice("")).toBeNull();
      expect(parseOptionalPrice("   ")).toBeNull();
    });

    it("parses a valid non-negative number", () => {
      expect(parseOptionalPrice("2.75")).toBe(2.75);
      expect(parseOptionalPrice("0")).toBe(0);
    });

    it("returns the invalid sentinel for non-numeric input", () => {
      expect(parseOptionalPrice("abc")).toBe("invalid");
    });

    it("returns the invalid sentinel for negative numbers", () => {
      expect(parseOptionalPrice("-0.01")).toBe("invalid");
    });
  });

  describe("formatPriceNumber", () => {
    it("renders a dash for null", () => {
      expect(formatPriceNumber(null)).toBe("-");
    });

    it("formats to 4 decimal places", () => {
      expect(formatPriceNumber(1)).toBe("1.0000");
      expect(formatPriceNumber(0.123456)).toBe("0.1235");
    });
  });

  describe("parsePositiveInt", () => {
    it("parses a valid positive integer", () => {
      expect(parsePositiveInt("128000")).toBe(128000);
    });

    it("rejects empty / whitespace-only input", () => {
      expect(parsePositiveInt("")).toBeNull();
      expect(parsePositiveInt("   ")).toBeNull();
    });

    it("rejects zero and negative values", () => {
      expect(parsePositiveInt("0")).toBeNull();
      expect(parsePositiveInt("-5")).toBeNull();
    });

    it("rejects non-integer values", () => {
      expect(parsePositiveInt("1.5")).toBeNull();
    });

    it("rejects non-numeric input", () => {
      expect(parsePositiveInt("abc")).toBeNull();
    });
  });

  describe("getSyncBadgeVariant", () => {
    it("returns neutral for a null status", () => {
      expect(getSyncBadgeVariant(null)).toBe("neutral");
    });

    it("maps success to the success variant", () => {
      expect(getSyncBadgeVariant("success")).toBe("success");
    });

    it("maps partial / running / skipped to the warning variant", () => {
      expect(getSyncBadgeVariant("partial")).toBe("warning");
      expect(getSyncBadgeVariant("running")).toBe("warning");
      expect(getSyncBadgeVariant("skipped")).toBe("warning");
    });

    it("maps failed to the error variant", () => {
      expect(getSyncBadgeVariant("failed")).toBe("error");
    });

    it("falls back to neutral for unrecognized statuses", () => {
      expect(getSyncBadgeVariant("unknown")).toBe("neutral");
    });
  });

  describe("getBillingTaskStatusLabel", () => {
    const t = (key: string) => key;

    it("returns the fallback when status is null", () => {
      expect(getBillingTaskStatusLabel(t, null, "fallback text")).toBe("fallback text");
    });

    it("maps each known status to its translation key", () => {
      expect(getBillingTaskStatusLabel(t, "success", "fallback")).toBe("syncTaskSuccess");
      expect(getBillingTaskStatusLabel(t, "partial", "fallback")).toBe("syncTaskPartial");
      expect(getBillingTaskStatusLabel(t, "failed", "fallback")).toBe("syncTaskFailed");
      expect(getBillingTaskStatusLabel(t, "running", "fallback")).toBe("syncTaskRunning");
    });

    it("falls back to the skipped label for any other status", () => {
      expect(getBillingTaskStatusLabel(t, "skipped", "fallback")).toBe("syncTaskSkipped");
    });
  });
});
