import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // 进场瀑布等装饰动画会加宽元素不稳定窗口，与列表轮询重渲染叠加时点击易
    // flake（element is not stable → detached）；e2e 关注功能而非动效，走
    // reduced-motion 路径把动画压至终帧，同时覆盖无障碍降级行为。
    contextOptions: { reducedMotion: "reduce" },
  },
  webServer: {
    command: `pnpm db:migrate:sqlite && pnpm dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
