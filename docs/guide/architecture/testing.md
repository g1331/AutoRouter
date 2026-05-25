---
title: 测试策略
outline: deep
---

# 测试策略

AutoRouter 的自动化测试沿两条轴展开：按运行环境分为 Vitest（单元 + 组件）与 Playwright（E2E）两套工具；按目的分为单元行为、组件渲染、a11y、视觉回归、E2E 流程、代理稳定性、迁移幂等。所有测试入口都在 `package.json` scripts 段声明，CI 通过 `verify.yml` 串成 6 个并行 job。本页说明这套布局的目的、`tests/` 目录的边界划分、如何在本地复现 CI 流程。

不在本页范围内的内容：CI 工作流本身见 [GitHub Actions CI 部署](../deployment/github-actions)；迁移一致性的具体校验逻辑见 [数据库选型与初始化](../deployment/database)；贡献流程与 pre-commit 配置见 [贡献指南与代码规范](./contributing)。

## 测试工具与命令对照

| 工具                | 命令                        | 覆盖范围                                                   |
| ------------------- | --------------------------- | ---------------------------------------------------------- |
| Vitest（监听模式）  | `pnpm test`                 | 本地开发实时反馈                                           |
| Vitest（一次运行）  | `pnpm test:run`             | CI 与 pre-push 校验                                        |
| Vitest（覆盖率）    | `pnpm test:run --coverage`  | 同上，加 v8 coverage                                       |
| Playwright E2E      | `pnpm e2e`                  | 真实浏览器端到端走查                                       |
| Playwright（带 UI） | `pnpm e2e:headed`           | 本地排查 E2E 用                                            |
| 代理稳定性 smoke    | `pnpm test:proxy-stability` | 把 mock 上游接到真实代理路径，验证 SSE / 非流式 / 故障转移 |
| 迁移一致性          | `pnpm db:check:consistency` | `drizzle/` 与 `drizzle-sqlite/` 是否与 schema 对齐         |

`tests/` 下的目录结构按上述命令选择性 include。Vitest 配置（`vitest.config.ts:20`）显式声明：

```ts
include: ["tests/components/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"];
```

即 `tests/components/` 与 `tests/unit/` 由 Vitest 跑；其他目录由 Playwright 等工具各自承接。

## `tests/` 目录划分

```
tests/
├── components/      # Vitest 组件测试（jsdom + React Testing Library）
│   ├── admin/
│   ├── dashboard/
│   └── ui/
├── unit/            # Vitest 纯函数 / hook / route handler 单元测试
│   ├── api/
│   ├── hooks/
│   ├── i18n/
│   ├── lib/
│   ├── scripts/
│   ├── services/
│   └── utils/
├── e2e/             # Playwright E2E（真实 Chromium + SQLite dev server）
├── a11y/            # Playwright + axe-core 可访问性扫描
├── visual/          # Playwright 截图视觉回归
├── fixtures/        # 流量录制 fixture（openai / anthropic / google）
└── setup.ts         # Vitest 全局 setup
```

各目录的边界判定如下：

| 目录                | 何时放在这里                                                                     | 何时不放在这里                                                              |
| ------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `tests/unit/`       | 测试单个函数、route handler、hook 的输入输出；通过 mock 切断外部副作用           | 涉及多组件协作的渲染（去 `tests/components/`）；需要真实浏览器（去 `e2e/`） |
| `tests/components/` | 单个 React 组件在 jsdom 下的渲染、交互、可访问性快速校验                         | 完整页面跨路由跳转、Server Component 行为（去 `e2e/`）                      |
| `tests/e2e/`        | 完整用户路径在真实浏览器中的可用性，例如「登录 → 创建上游 → 发请求 → 看日志」    | 单个函数行为                                                                |
| `tests/a11y/`       | 用 axe-core 扫页面级 a11y 缺陷                                                   | 单组件 a11y（应在 `tests/components/` 中用 jest-dom 断言）                  |
| `tests/visual/`     | 视觉回归，固定 viewport 截图对比                                                 | 内容快速变化的页面（截图会频繁飘）                                          |
| `tests/fixtures/`   | 由流量录制写入的真实上游响应样本，供 `/api/mock/*` 回放或 fixture 驱动的单元测试 | 任何 `*.test.ts` / `*.spec.ts` 文件                                         |

`tests/integration/` 这个目录当前**不存在**——历史上有过这个概念，目前已经被分散到 `tests/unit/api/` 与 `tests/e2e/` 两个目录。文档以仓库现状为准。

## Vitest 配置要点

`vitest.config.ts` 内的几个关键决策：

| 配置                               | 含义                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `environment: "jsdom"`             | 所有测试都跑在 jsdom 里，React Testing Library 能直接渲染组件          |
| `globals: true`                    | 不需要在每个文件 `import { describe, it } from "vitest"`               |
| `setupFiles: ["./tests/setup.ts"]` | jest-dom 断言、全局 mock、polyfill 都在这里挂                          |
| `coverage.provider: "v8"`          | v8 native coverage，性能优于 istanbul                                  |
| `coverage.include`                 | 只测 `src/components/**`、`src/lib/**`、`src/hooks/**`，避开页面 / API |
| 别名 `@` → `./src`                 | 与 Next.js `tsconfig.json` 中的路径别名保持一致                        |

`coverage.include` 把覆盖率统计范围限定在「可单元化的纯逻辑」上。`src/app/` 下的 route handler 通常通过 `tests/unit/api/` 间接测试，但路径本身不计入覆盖率分母——避免被「Next.js 自动生成的 SSR 入口」拉低覆盖率指标。

## 单元测试的常见形态

### Route handler 单元测试

测试 `src/app/api/admin/*` 下的 route handler：构造 `NextRequest`，调用 handler，断言返回值。位于 `tests/unit/api/`：

```ts
// tests/unit/api/admin/circuit-breakers/route.test.ts
const request = new NextRequest("http://localhost/api/admin/circuit-breakers", {
  headers: { authorization: `Bearer ${adminToken}` },
});
const response = await GET(request);
expect(response.status).toBe(200);
```

通过 mock `@/lib/db` 与 `@/lib/services/*` 切断真实数据库。

### Service 单元测试

测试 `src/lib/services/*` 下的业务函数：`failover-config.test.ts`、`circuit-breaker.test.ts` 等。多数 service 都设计为「函数式 + 显式依赖注入」，所以测试时直接调用函数即可。

### Hook 单元测试

测试 `src/hooks/*`：包一层 `QueryClientProvider`，用 `renderHook` 触发，断言 hook 状态。`tests/unit/hooks/use-request-logs.test.ts` 是参考样例。

## Playwright E2E

`playwright.e2e.config.ts:18-23` 的 `webServer` 段定义了 E2E 启动方式：

```ts
webServer: {
  command: `pnpm db:migrate:sqlite && pnpm dev --port ${port}`,
  url: baseURL,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
}
```

每次 `pnpm e2e` 运行前都会：

1. 先跑 `db:migrate:sqlite` 把 SQLite schema 对齐到最新。
2. 启 dev server。
3. 等 baseURL 200 后再开始跑测试。
4. CI 环境强制重新启 dev server；本地复用已有进程，方便单测调试。

E2E 用 SQLite 而不是 PG 的原因：CI 不希望为 E2E 拉一个 PG 服务容器、本地环境也不希望强制要求 Docker。SQLite 在 E2E 路径上不会触及 `PERCENTILE_CONT` 等不兼容查询，安全。

::: tip E2E 验收的是路径而非数据
当前 E2E 用例集中在两个场景：`billing-tier-flow.spec.ts` 校验阶梯计费下单后日志与计费快照的展示；`logs-routing-decision.spec.ts` 校验路由决策可视化在端到端是否正确。新增 E2E 之前先确认场景是否「单元测试 + 组件测试」就足以覆盖——E2E 跑得慢且不稳定，应当只作为关键路径的回归网。
:::

## 代理稳定性 smoke

`pnpm test:proxy-stability` 调用 `scripts/ci/proxy-stability-check.mjs`。该脚本：

1. 占用一个随机空闲端口启动 AutoRouter（连真实 PG）。
2. 在 127.0.0.1 上启一个 mock 上游。
3. 通过 admin API 创建测试上游与测试 Key。
4. 串行发若干笔请求（非流式 / 流式 / 故障转移），断言每一笔的响应符合预期。
5. 清理资源。

这条 smoke 覆盖了 Vitest 单元测试覆盖不到的部分：「真实 HTTP 跨进程通讯」「SSE 双工管道」「failover 完整链路」。CI 上由 `verify.yml` 的 `proxy-stability` job 跑，连真实 `postgres:16-alpine` 服务容器。

## 迁移一致性

`pnpm db:check:consistency` 调用 `scripts/ci/check-drizzle-consistency.mjs`，把当前 `schema-pg.ts` 与 `schema-sqlite.ts` 重新走一遍 `db:generate*` 流程，若生成结果与 `drizzle/`、`drizzle-sqlite/` 已 commit 的 SQL 与 snapshot 不一致则失败。详细机制见 [数据库选型与初始化](../deployment/database) 的「CI 上的迁移校验」。

## CI 工作流的测试 job 拓扑

`.github/workflows/verify.yml` 把上述工具串成 6 个并行 job + 1 个 status job：

| Job               | 跑的命令                                                         | 关键依赖                         |
| ----------------- | ---------------------------------------------------------------- | -------------------------------- |
| `quality`         | lint / format / tsc / `test:run --coverage`                      | jsdom，无外部服务                |
| `build`           | `pnpm build`                                                     | 仅 Node 22                       |
| `migration`       | `db:check:consistency`、`db:migrate`、再 `db:migrate`（幂等性）  | `postgres:16-alpine` 服务容器    |
| `proxy-stability` | `pnpm test:proxy-stability`                                      | `postgres:16-alpine` 服务容器    |
| `e2e`             | `pnpm exec playwright install --with-deps chromium` + `pnpm e2e` | 在 GitHub runner 上安装 chromium |
| `actionlint`      | `raven-actions/actionlint@v2`                                    | 校验所有 workflow yml            |
| `verify-status`   | 等所有 job 完成，对每个 `needs.<job>.result` 判定                | 分支保护规则只需勾这一个         |

`migration` 与 `proxy-stability` 各自单独拉一个 PG 容器、不与其他 job 共享数据库，避免互相污染。

`e2e` 在 GitHub Actions runner 上 `playwright install --with-deps chromium` 大约耗时 30s 左右；首跑会略慢，后续靠 GitHub 的镜像缓存复用。

## 本地复现 CI

CI 失败时按下面顺序在本地复现：

```bash
# 1. 与 CI 同款的「锁文件强一致」安装
pnpm install --frozen-lockfile

# 2. 静态检查全套
pnpm lint
pnpm format:check
pnpm exec tsc --noEmit

# 3. 单元 + 组件测试（含覆盖率）
pnpm test:run --coverage

# 4. 生产构建
DB_TYPE=postgres pnpm build

# 5. 需要 PG 时单独起容器再跑
docker run --rm -d --name pg-ci \
  -e POSTGRES_USER=autorouter -e POSTGRES_PASSWORD=autorouter -e POSTGRES_DB=autorouter \
  -p 5432:5432 postgres:16-alpine

DATABASE_URL=postgresql://autorouter:autorouter@127.0.0.1:5432/autorouter \
  pnpm db:check:consistency

DATABASE_URL=postgresql://autorouter:autorouter@127.0.0.1:5432/autorouter \
  pnpm db:migrate

AUTOROUTER_DATABASE_URL=postgresql://autorouter:autorouter@127.0.0.1:5432/autorouter \
  pnpm test:proxy-stability

# 6. E2E
pnpm e2e
```

每一步对应一个 CI job，按这个顺序排错可以快速定位故障来源。

## 新增测试的实践

写新测试时先确认它属于哪一类：

| 想测的对象                        | 放哪里                                    | 命名约定             |
| --------------------------------- | ----------------------------------------- | -------------------- |
| `src/lib/utils/` 下的纯函数       | `tests/unit/utils/`                       | `<name>.test.ts`     |
| `src/lib/services/` 下的 service  | `tests/unit/services/`                    | `<name>.test.ts`     |
| `src/hooks/` 下的 hook            | `tests/unit/hooks/`                       | `<name>.test.ts`     |
| `src/app/api/` 下的 route handler | `tests/unit/api/<同源路径>/route.test.ts` | mirror 源码路径      |
| 组件交互 / 渲染                   | `tests/components/<对应子目录>/`          | `<name>.test.tsx`    |
| 完整用户路径                      | `tests/e2e/`                              | `<scenario>.spec.ts` |
| a11y 扫描                         | `tests/a11y/`                             | `<page>.spec.ts`     |
| 视觉回归                          | `tests/visual/`                           | `<page>.spec.ts`     |

新增测试时同步看 `tests/setup.ts` 中的全局 mock 是否需要扩充。

## 来源对照

- `vitest.config.ts`：include 模式、环境、coverage 范围
- `playwright.e2e.config.ts`：E2E webServer 与 reuseExistingServer 策略
- `tests/setup.ts`、`tests/unit/` / `tests/components/` 等目录：实际的测试组织
- `scripts/ci/check-drizzle-consistency.mjs`、`scripts/ci/proxy-stability-check.mjs`：CI 上自定义 smoke 的实现
- `.github/workflows/verify.yml`：完整 CI 拓扑与每个 job 的依赖
- `package.json` scripts 段：所有测试命令的定义
