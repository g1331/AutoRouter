import "@testing-library/jest-dom";
import packageJson from "../package.json";

/**
 * Vitest Setup File
 *
 * Global test configuration and matchers. Browser-only mocks are guarded behind
 * a `window` check so the same setup works for node-environment unit tests
 * (e.g. backend utilities) and jsdom-environment component tests.
 */
process.env.DB_TYPE = "postgres";
process.env.NEXT_PUBLIC_APP_VERSION = packageJson.version;

if (typeof window !== "undefined") {
  // Mock window.matchMedia for components that use media queries
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  // Mock ResizeObserver
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  // Polyfill requestAnimationFrame for jsdom environment
  // @see https://github.com/testing-library/react-testing-library/issues/1198
  global.requestAnimationFrame = (callback: FrameRequestCallback) => {
    return setTimeout(callback, 0) as unknown as number;
  };
  global.cancelAnimationFrame = (id: number) => {
    clearTimeout(id);
  };

  // Mock localStorage for jsdom environment
  const localStorageStore: Record<string, string> = {};
  const localStorageMock = {
    getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      localStorageStore[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete localStorageStore[key];
    }),
    clear: vi.fn(() => {
      Object.keys(localStorageStore).forEach((key) => delete localStorageStore[key]);
    }),
    length: 0,
    key: vi.fn(),
  };
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
  });
}
