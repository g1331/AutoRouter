import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Stub env before importing logger (config reads env at import time)
beforeAll(() => {
  vi.stubEnv("ENCRYPTION_KEY", "dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXRlc3Q=");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("logger", () => {
  it("should export a root logger with expected methods", async () => {
    const { logger } = await import("@/lib/utils/logger");
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.fatal).toBe("function");
    expect(typeof logger.child).toBe("function");
  });

  it("should export createLogger factory", async () => {
    const { createLogger } = await import("@/lib/utils/logger");
    expect(typeof createLogger).toBe("function");
  });

  it("createLogger should return a child logger with module field", async () => {
    const { createLogger } = await import("@/lib/utils/logger");
    const child = createLogger("test-module");
    expect(child).toBeDefined();
    expect(typeof child.info).toBe("function");
    // child logger bindings include the module name
    expect(
      (child as unknown as { bindings: () => Record<string, unknown> }).bindings().module
    ).toBe("test-module");
  });
});
