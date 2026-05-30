# Project Context

## Purpose

AutoRouter 是一个 AI API 网关（AI API Gateway），面向多上游治理场景，提供客户端 API Key 分发与管理、按模型与请求能力的多上游自动路由、负载均衡、熔断与故障转移、并发与配额控制、请求日志与统计、按请求计费等能力。它是单一的 Next.js 全栈应用：同一进程同时承担管理后台 UI、管理 API 与面向调用方的 AI 代理 API，没有独立的后端服务。

## Tech Stack

- 框架：Next.js 16（App Router，standalone 构建）、React 19、TypeScript 5。后端逻辑由 Next.js API Routes 承担，前后端同属一个应用、同一域名。
- 数据库与 ORM：Drizzle ORM。支持双数据库方言，PostgreSQL 16（默认，生产推荐）与 SQLite（本地开发沙箱）。迁移工具为 drizzle-kit，PG 迁移目录 `drizzle/`，SQLite 迁移目录 `drizzle-sqlite/`。
- 国际化：next-intl，支持简体中文（`zh-CN`，默认）与英文（`en`），中间件文件为 `src/proxy.ts`。
- 前端：shadcn/ui 组件体系、Tailwind CSS 4、TanStack Query（数据获取）、recharts（图表）、react-hook-form 与 zod（表单与校验）。
- 安全：客户端 Key 使用 bcryptjs 哈希；上游凭据使用自实现的 Fernet 兼容加密（`src/lib/utils/encryption.ts`，密钥 44 字符 base64）；配置校验使用 zod。
- 日志：pino（结构化日志）。
- 测试：Vitest（单元与组件测试，jsdom 环境）、Playwright（端到端测试）。
- 构建与依赖：pnpm@9.12.0（无 monorepo workspace，依赖集中在根目录 `package.json`）。运行与构建使用 Node.js 22。
- 质量工具：ESLint（`eslint.config.mjs`，flat config，集成 `eslint-config-next` 与 `@typescript-eslint`）、Prettier（printWidth 100）、`tsc --noEmit` 类型检查。

## Project Conventions

### Code Style

- TypeScript 全量 strict。ESLint 采用 flat config（`eslint.config.mjs`），Prettier 统一格式（printWidth 100，LF 行尾）。
- 默认 UTF-8。仓库文档与产出物默认使用简体中文撰写；代码标识符、CLI 命令、日志与错误消息保留原始语言。
- 数据库 schema 修改时，`src/lib/db/schema-pg.ts` 与 `src/lib/db/schema-sqlite.ts` 必须同步保持字段一致；业务代码统一按 PostgreSQL 类型编写。

### Architecture Patterns

- 单一 Next.js 应用：`src/app/api/` 为后端 API Routes（`admin/` 管理接口、`proxy/v1/[...path]` 代理入口、`health/` 健康探针、`mock/[...path]` 录制回放）；`src/app/[locale]/(dashboard)/` 为需登录的管理页面，`src/app/[locale]/(auth)/login/` 为登录页。
- 运行期业务逻辑集中在 `src/lib/services/`（代理转发、上游管理、能力路由与负载均衡、熔断与健康检查、计费、流量录制、后台同步、CLIProxyAPI 集成等）。
- 数据访问层在 `src/lib/db/`：`schema.ts` 作为 barrel，按 `config.dbType` 在导入时分派到 `schema-pg.ts` 或 `schema-sqlite.ts`；`index.ts` 提供惰性初始化、方言感知的 `db` 客户端。
- 配置集中在 `src/lib/utils/config.ts`，用 zod schema 加载并校验所有环境变量，导出单例 `config`。环境变量示例见仓库根目录 `.env.example`。
- 代理选路以能力路由为主：`route-capability-matcher` 把请求路径映射为 `RouteCapability`，结合上游能力声明、Key 授权、模型规则、健康与熔断状态构建候选集，再由 `load-balancer` 做加权随机选择并处理并发与队列准入，`session-affinity` 维持会话粘性，失败时按 `failover` 配置转移到下一个候选上游。

### Testing Strategy

- 单元与组件测试使用 Vitest：`pnpm test`（watch）、`pnpm test:run`（单次）、`pnpm test:run --coverage`（覆盖率）。
- 端到端测试使用 Playwright：`pnpm e2e`（会自动起 SQLite 与 dev server）。
- 类型检查使用 `pnpm exec tsc --noEmit`；静态检查与格式检查为 `pnpm lint` 与 `pnpm format:check`。
- 数据库迁移一致性由 `pnpm db:check:consistency` 校验。涉及代码改动的任务必须补充对应测试。

### Git Workflow

- 主干开发：默认分支 `master`，功能分支 → PR → 合并；提交信息遵循 Conventional Commits。
- 提交前由 `.pre-commit-config.yaml` 执行 prettier、eslint `--fix`、`tsc --noEmit` 等钩子；提交时不得跳过 pre-commit。
- 涉及代码改动的 OpenSpec 任务，每个阶段（phase）完成后应提交代码，提交需通过质量门禁。
- CI 工作流 `.github/workflows/verify.yml` 在 PR 上运行 lint、格式检查、类型检查、Vitest 覆盖率、生产构建、迁移一致性、代理稳定性冒烟与 Playwright E2E。

## Domain Context

- 上游（upstream）指具体的 AI 服务提供方或中转，例如 OpenAI、Anthropic、Google Gemini，以及通过 CLIProxyAPI 承接的 Codex / Claude / Gemini OAuth 账号池。上游配置（base URL、加密凭据、能力声明、权重、优先级、模型规则、失败规则等）持久化在数据库中。
- 客户端 API Key 绑定可访问的上游集合与过期时间，并可设置消费配额；代理请求按 Key 鉴权后进入选路流程。
- 计费按每次请求计算并写入费用快照，单价来源由后台同步任务维护，可叠加手动覆盖、阶梯规则与按上游倍率。

## Important Constraints

- 生产环境若未显式设置 `DB_TYPE`，则必须设置 `DATABASE_URL`，否则启动时 fast-fail，不会静默回退到 SQLite。
- `ENCRYPTION_KEY` 必须为 44 字符 base64（解码后 32 字节），可通过 `ENCRYPTION_KEY_FILE` 从挂载文件读入。该密钥一旦丢失，所有以 Fernet 加密的上游凭据将无法解密，必须安全备份。
- 删除数据库文件、清空数据、重置状态等破坏性操作必须先与协作者确认后再执行。
- 依赖增删使用 `pnpm add` / `pnpm remove`；不存在 Python 运行时、`uv` 或 `pyproject.toml`。
- 许可证为 AGPL-3.0。

## External Dependencies

- 核心运行时依赖（见 `package.json`）：`next`、`react` / `react-dom`、`drizzle-orm`、`postgres`、`next-intl`、`zod`、`pino`、`bcryptjs`、`@tanstack/react-query`、`recharts`、`react-hook-form`、`date-fns`、`lucide-react`，以及 `@radix-ui/*` 与 `tailwindcss` 相关 UI 依赖。
- 开发依赖：`@libsql/client`（SQLite 驱动）、`drizzle-kit`、`vitest` 与 `@vitest/coverage-v8`、`@playwright/test`、`@testing-library/*`、`eslint` 与 `eslint-config-next`、`prettier`、`tsx`、`vitepress`（文档站）。
- 外部服务：上游 AI 服务由运行时在管理后台登记，凭据加密存储；可选的 CLIProxyAPI 以外部实例或受管 sidecar 形态接入。文档站基于 VitePress 构建并发布到 GitHub Pages。
