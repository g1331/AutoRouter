import { defineConfig } from "@playwright/test";

// 视觉回归（tests/visual）与无障碍扫描（tests/a11y）的共享配置。
// 与 playwright.e2e.config.ts 复用同一套 SQLite + dev server bootstrap，
// 本地已有 dev server 时直接复用。视觉基线在 Windows 生成（快照带平台
// 后缀），跨平台字体渲染有差异，因此两个 project 均不接入 CI。

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  fullyParallel: true,
  timeout: 45_000,
  reporter: [["list"]],
  expect: {
    // fullPage 截图对滚动条/亚像素抗锯齿敏感，容忍 1% 以内的像素抖动。
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  use: {
    baseURL,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // 与 e2e 一致：装饰动画走 reduced-motion 压至终帧，稳定截图与扫描。
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    { name: "visual", testDir: "./tests/visual" },
    { name: "a11y", testDir: "./tests/a11y" },
  ],
  webServer: {
    command: `pnpm db:migrate:sqlite && pnpm dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
