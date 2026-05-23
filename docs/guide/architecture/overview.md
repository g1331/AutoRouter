---
title: 整体架构总览
outline: deep
---

# 整体架构总览

AutoRouter 是一个 Next.js 全栈应用：同一个进程同时承担「管理后台 UI」「管理 API」「面向调用方的 AI 代理 API」三类职责，没有独立的后端服务。大部分持久化状态落在一个关系型数据库（默认 PostgreSQL，可选 SQLite）；唯一的例外是流量录制功能——`recordTrafficFixture`（`src/lib/services/traffic-recorder.ts:517`）把每条录制的请求 / 响应 fixture 以 JSON 文件形式写到本地磁盘，目录默认为 `data/traffic-recordings`，可由环境变量 `RECORDER_FIXTURES_DIR` 覆盖（`src/lib/services/traffic-recording-service.ts:148`、`:163`）。数据库 `trafficRecordings` 表只保存索引（`fixture_path`、`outcome`、`status_code` 等元数据，`src/lib/db/schema-pg.ts:360`），完整请求 / 响应内容只存在于该磁盘目录内。部署侧规划备份时，若启用了录制，必须同时备份数据库与该磁盘目录，单独备份数据库无法恢复 fixture。除录制以外的所有运行期决策（鉴权、选路、熔断、计费）都基于数据库当前快照做出。本页给出整套系统的分层结构、关键模块以及彼此之间的关系，让阅读者在动手改任何具体功能前先建立全貌。

## 进程拓扑

最小化的部署只有一个长驻进程：

```
┌──────────────────────────────────────────────────────────────────┐
│                  AutoRouter (Next.js standalone)                 │
│                                                                  │
│  ┌────────────────────────┐    ┌────────────────────────────┐    │
│  │ /[locale]/(dashboard)  │    │   /api/admin/* (管理 API)  │    │
│  │  管理后台 React UI     │ ─▶ │   上游/密钥/熔断/日志/计费 │    │
│  └────────────────────────┘    └────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────┐    ┌────────────────────────────┐    │
│  │ /api/proxy/v1/[...path]│    │  /api/health (无鉴权探针)  │    │
│  │  面向调用方的代理入口  │    │                            │    │
│  └────────────────────────┘    └────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                ┌──────────────────────────────────┐
                │ PostgreSQL（默认）/ SQLite（可选）│
                │  唯一持久化层，所有运行期决策依据 │
                └──────────────────────────────────┘
                                  │
                                  ▼
                ┌──────────────────────────────────┐
                │  上游 AI 服务（OpenAI / Anthropic │
                │   / Gemini / 中转 / CLIProxy …） │
                └──────────────────────────────────┘
```

构建产物用 Next.js standalone 模式（`next.config.ts:9`），所以正式镜像里没有 dev-server、没有热重载，启动后即就绪。可选的 CLIProxyAPI sidecar 不属于必选拓扑，它的接入方式见 [CLIProxyAPI Sidecar 部署](../deployment/cliproxy-sidecar)。

## 目录分层

代码组织遵循 Next.js App Router 的常规分层，运行期逻辑集中在 `src/lib/services/`：

| 路径                                      | 职责                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `src/app/api/proxy/v1/[...path]/route.ts` | 唯一的代理入口，GET/POST/PUT/DELETE/PATCH 都委托给同一个 `handleProxy` 函数 |
| `src/app/api/admin/`                      | 管理 API：上游、密钥、熔断、日志、统计、计费、流量录制、CLIProxy 等         |
| `src/app/api/health/route.ts`             | 公开健康探针，不需要鉴权                                                    |
| `src/app/[locale]/(dashboard)/`           | 管理后台页面集合（需要登录）                                                |
| `src/app/[locale]/(auth)/login/`          | 登录页（独立布局，不挂 dashboard 框架）                                     |
| `src/lib/services/`                       | 全部运行期业务逻辑模块                                                      |
| `src/lib/db/`                             | Drizzle ORM schema 与数据库 client                                          |
| `src/lib/utils/`                          | 通用工具：配置加载、鉴权 helper、加密、CORS 等                              |
| `src/components/`                         | 管理后台 React 组件（shadcn/ui 基础）                                       |
| `src/hooks/`                              | TanStack Query 包装的数据获取 hooks                                         |
| `src/i18n/`、`src/messages/`              | next-intl 配置与中英文翻译                                                  |

`src/app/api/proxy/v1/[...path]/route.ts` 在文件末尾把所有 HTTP 方法都导向同一个内部函数（`POST` 位于第 4141 行、`handleProxy` 位于第 2434 行），后文「请求生命周期」会逐步展开它的内部流程。

## 服务模块清单

`src/lib/services/` 下的所有模块按职责分为以下几组，归类可作为阅读源码时的索引：

### 代理与转发

- `proxy-client.ts`：与上游建立 HTTP 连接、复制 header、转发请求与流。
- `request-logger.ts`：请求开始时写入「in-progress」日志行，结束时更新；同时承载实时日志推送的数据源。
- `stats-service.ts`：聚合 `requestLogs` 与 `requestBillingSnapshots` 形成统计面板。
- `unified-error.ts`：把内部异常统一映射为带 `code` 字段的 JSON 错误响应。

### 上游管理

- `upstream-crud.ts`：上游的增删改查与字段校验。
- `upstream-service.ts`：上层入口，重新导出 CRUD 与上游服务的对外 API。
- `upstream-connection-tester.ts`：「测试连接」按钮的实现。
- `upstream-ssrf-validator.ts`：阻止上游 base URL 指向内网或回环地址。
- `upstream-probe-service.ts`、`upstream-quota-tracker.ts`：探活与额度跟踪。
- `upstream-model-catalog-background-sync.ts`、`upstream-model-discovery.ts`、`upstream-model-rules.ts`、`upstream-model-types.ts`：模型目录的拉取、识别、规则、类型定义。
- `upstream-failure-rules.ts`、`upstream-queue-admission.ts`：失败触发熔断的判定与请求入队控制。

### 路由选路

- `model-router.ts`：从请求模型名 + 路由能力筛出候选上游集合。
- `route-capability-matcher.ts`：把客户端请求路径（与可选的请求头 profile）映射为 `RouteCapability`，例如 `/v1/chat/completions` → `openai_chat_compatible`、`/v1/messages` → `anthropic_messages` 或 `claude_code_messages`。
- `load-balancer.ts`：在候选集合内做加权随机选择，结合延时分数与熔断状态过滤。
- `session-affinity.ts`：会话粘性策略，保障同一对话尽量命中同一上游。
- `failover-config.ts`：失败转移的触发条件配置（哪些状态码、哪些错误类型算可重试）。
- `route-capability-migration.ts`：早期上游缺失 capability 字段时的回填迁移。

### 健康与熔断

- `circuit-breaker.ts`：熔断器状态机，三态 `CLOSED` / `OPEN` / `HALF_OPEN`；提供「转发前申请准入」「转发后记录成功 / 失败」「强制开关」三类操作。
- `health-checker.ts`：后台周期性主动探活，更新 `upstreamHealth` 表。

### 客户端密钥与认证

- `key-manager.ts`：客户端 Key 的生成、bcrypt 哈希、Fernet 加密原文、揭示与删除。
- `api-key-quota-tracker.ts`、`spending-rules.ts`：Key 维度的额度与消费规则判定。

### 计费与限额

- `billing-cost-service.ts`：按请求计算费用并 upsert 到 `requestBillingSnapshots`。
- `billing-price-service.ts`：模型单价的读写。
- `billing-price-background-sync.ts`：后台同步定价源。
- `billing-management-service.ts`：管理 API 的计费业务封装。
- `compensation-service.ts`：请求头补偿规则（例如某些上游需要追加固定 header）。

### 流量录制与回放

- `traffic-recorder.ts`：根据 `trafficRecordingSettings` 的运行期开关决定是否把请求 / 响应快照写入磁盘。
- `traffic-recording-service.ts`：管理 API 对录制配置与历史的封装。
- `traffic-recording-background-cleanup.ts`：按 retention 策略清理历史录制。

### CLIProxy 集成

- `cliproxy-instance-crud.ts`、`cliproxy-management-client.ts`：CLIProxy 实例的注册与管控。
- `cliproxy-auth-account-service.ts`、`cliproxy-oauth-login-service.ts`：CLIProxy 侧 OAuth 账号管理。
- `cliproxy-connection-tester.ts`、`cliproxy-upstream-preset.ts`：连接测试与预置上游模板。

### 后台同步框架

- `background-sync.ts`、`background-sync-scheduler.ts`、`background-sync-store.ts`、`background-sync-registry.ts`、`background-sync-types.ts`：把所有后台周期任务（模型目录同步、定价同步等）纳入统一调度。

### 实时数据推送

- `request-log-live-updates.ts`：管理后台「请求日志」页的实时刷新数据源。

## 数据模型

`src/lib/db/schema.ts` 是入口，按部署的数据库类型代理到 `schema-pg.ts` 或 `schema-sqlite.ts`，两者字段保持一致。以 PostgreSQL 版本为准，所有表如下：

| 表名                          | 用途                                                           |
| ----------------------------- | -------------------------------------------------------------- |
| `apiKeys`                     | 客户端访问密钥（bcrypt hash + Fernet 加密原文）                |
| `upstreams`                   | 上游服务配置（base URL、加密的 api_key、能力声明、权重、规则） |
| `upstreamHealth`              | 各上游的最新健康快照                                           |
| `upstreamProbeResults`        | 探活结果历史                                                   |
| `apiKeyUpstreams`             | 客户端 Key 与上游的 M:N 关联（受限模式可见性）                 |
| `circuitBreakerStates`        | 熔断器状态                                                     |
| `upstreamFailureRules`        | 自定义失败触发熔断规则                                         |
| `requestLogs`                 | 请求日志完整记录（含 failover 历史）                           |
| `trafficRecordingSettings`    | 流量录制运行期配置单例                                         |
| `trafficRecordings`           | 已录制的流量快照                                               |
| `billingModelPrices`          | 模型单价                                                       |
| `billingManualPriceOverrides` | 单价手动覆盖                                                   |
| `billingTierRules`            | 阶梯计费规则                                                   |
| `billingPriceSyncHistory`     | 价格同步历史                                                   |
| `requestBillingSnapshots`     | 每次请求的费用快照                                             |
| `backgroundSyncTasks`         | 后台同步任务定义                                               |
| `backgroundSyncTaskRuns`      | 后台同步任务运行历史                                           |
| `compensationRules`           | 请求头补偿规则                                                 |
| `cliproxyInstances`           | CLIProxy 实例注册                                              |
| `cliproxyAuthAccounts`        | CLIProxy OAuth 账号                                            |

需要查 schema 字段细节时，直接读 `src/lib/db/schema-pg.ts`；SQLite 部署模式下读 `schema-sqlite.ts`。Drizzle 的 migration 文件目录在 `drizzle/`，由 `pnpm db:generate` 生成。

## 进入与离开应用的边界

应用对外暴露三类入口，行为差异如下：

| 入口                 | 鉴权方式                       | 用途               |
| -------------------- | ------------------------------ | ------------------ |
| `/api/proxy/v1/*`    | 客户端 Key（三种 header 任一） | 转发到上游 AI 服务 |
| `/api/admin/*`       | `ADMIN_TOKEN` Bearer           | 管理后台数据接口   |
| `/api/health`        | 无                             | 健康探针           |
| `/[locale]/...` 页面 | 浏览器侧 sessionStorage Token  | 管理后台 UI        |

代理入口的全部 HTTP 方法都委托给 `handleProxy`；管理 API 的每个路由独立鉴权；健康探针完全公开。next-intl 中间件位于 `src/proxy.ts`（注意：是 `src/proxy.ts`，不是 Next.js 默认惯用的 `src/middleware.ts`），其 matcher 显式排除 `/_next`、`/api`、带扩展名的资源路径，因此中间件**不会**拦截任何 API 请求，所有 API 鉴权都发生在 route handler 自身内部。

## 国际化与路由分组

`src/app/[locale]/` 是页面路由的根，`[locale]` 由 next-intl 在中间件层解析。配置如下：

- `src/i18n/config.ts`：支持的语言列表 `["zh-CN", "en"]`，默认 `"zh-CN"`。
- `src/i18n/routing.ts`：`localePrefix: "always"`，即所有页面 URL 强制带语言前缀；cookie 名 `NEXT_LOCALE` 用于记住用户选择。
- `next.config.ts`：通过 `createNextIntlPlugin("./src/i18n/request.ts")` 把 next-intl 挂入 Next.js 构建。

`[locale]/` 下用了两个路由组：

- `(auth)/login/`：登录页，使用独立布局，不挂 dashboard 框架。
- `(dashboard)/`：所有需要登录的管理页面（仪表盘、上游、密钥、日志、设置、系统等）。

中英文翻译文件位于 `src/messages/zh-CN.json` 与 `src/messages/en.json`，组件内通过 `useTranslations("nav")` 之类的 hook 调用。新增页面或菜单时需要在两份翻译文件中同时补齐键名。

## 关键依赖与版本

正式镜像内固化的关键依赖版本（`package.json` 第 31–64 行）：

| 依赖          | 版本   | 用途                       |
| ------------- | ------ | -------------------------- |
| `next`        | 16.2.6 | 全栈框架（含 App Router）  |
| `drizzle-orm` | 0.45.2 | TypeScript ORM             |
| `next-intl`   | 4.9.2  | 国际化                     |
| `bcryptjs`    | 3.0.3  | 客户端 Key hash（成本 12） |
| `zod`         | 4.1.13 | 运行期 schema 校验         |
| `pino`        | 10.3.0 | 结构化日志                 |

Fernet 加密没有独立 npm 包，实现位于 `src/lib/utils/encryption.ts`（自实现的 Python Fernet 兼容版本，密钥需为 32 字节 base64）。

## 配置加载

`src/lib/utils/config.ts` 用 Zod schema 加载并校验所有环境变量，导出单例 `config`。关键约束如下：

- 生产环境必须显式设置 `DATABASE_URL`，否则启动时 fast-fail。
- `ENCRYPTION_KEY` 必须为 44 字符 base64（解码后 32 字节），可通过 `ENCRYPTION_KEY_FILE` 从挂载文件读入。
- `ADMIN_TOKEN` 必填，用于管理 API Bearer 鉴权。
- `CORS_ORIGINS` 是逗号分隔的白名单，默认 `http://localhost:3000`，但当前代码只在 `config.ts` 解析它、没有任何代码读它后输出 `Access-Control-Allow-*` 响应头，因此该字段没有运行期效果（详见 [请求生命周期](./request-lifecycle) 阶段二）。
- 其他可调字段：`LOG_LEVEL`、`LOG_RETENTION_DAYS`、`HEALTH_CHECK_INTERVAL` 等。

各字段的完整含义与默认值见 [`.env` 配置参考](../deployment/env-reference)。

## 部署与 CI 入口

| 文件                                    | 用途                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `Dockerfile`                            | 多阶段构建，基于 `node:22-alpine`，产出 standalone 镜像                 |
| `docker-compose.yml`                    | 默认部署编排，包含 AutoRouter 与数据库                                  |
| `docker-compose.cliproxy.yml`           | 可叠加文件，附加 CLIProxyAPI sidecar                                    |
| `.github/workflows/release.yml`         | Tag `v*` 触发，构建并推送镜像到 `ghcr.io/g1331/autorouter`              |
| `.github/workflows/verify.yml`          | `src/**` 或 `tests/**` 变更时跑测试与校验                               |
| `.github/workflows/deploy-personal.yml` | `workflow_dispatch` 手动触发，按指定镜像 tag 通过 SSH 部署到个人服务器  |
| `.github/workflows/docs.yml`            | `master` 上文档相关路径变更时，构建并发布 VitePress 站点到 GitHub Pages |

## 接下来读什么

- 想从「调用一次 `/api/proxy/v1/chat/completions` 后内部发生了什么」入手，看 [请求生命周期](./request-lifecycle)。
- 想了解部署细节，看 [部署总览](../deployment/overview)、[快速开始](../deployment/quickstart)。
- 想从管理后台界面入手，看 [管理后台总览](../usage/admin-overview)。
- 想从调用方角度入手，看 [通过 AutoRouter 调用模型](../usage/invoke-models)。
