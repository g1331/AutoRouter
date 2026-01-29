import "@testing-library/jest-dom";

/**
 * Vitest Setup File
 *
 * Global test configuration and matchers.
 */

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
