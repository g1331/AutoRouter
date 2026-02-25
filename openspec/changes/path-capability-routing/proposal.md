## Why

当前路由主逻辑依赖请求体里的 `model` 字段和上游 `providerType` 对齐，这在命令行场景并不稳定。像 Claude Code、Codex、Gemini 这类客户端本质是按请求路径调用不同接口能力，继续以模型名作为第一判定条件会导致误路由和配置复杂度上升。

## What Changes

- 将代理路由主判定从“模型优先”调整为“请求路径与方法优先”，`model` 仅作为兼容兜底。
- 为上游新增“能力多选”配置，允许一个上游同时声明支持多个请求能力类型。
- 新增路径能力映射层，将常见路径归类到能力类型（例如 `anthropic_messages`、`codex_responses`、`gemini_native_generate` 等）。
- 路由选择流程改为：请求路径归类能力 → 过滤已授权且健康的上游 → 复用现有优先级、权重、故障转移机制进行选择。
- Admin API 与管理界面同步支持上游多能力配置与校验。
- 上游能力选择与展示从纯文本升级为“图标 + 文案”样式，并明确一个上游可同时展示多个能力图标。
- 路由日志增强，记录“匹配到的路径能力类型”和“最终选择上游”的决策信息。
- 提供兼容迁移策略：已有 `providerType`/`allowedModels` 配置可自动映射为初始能力集合，降低升级成本。

## Capabilities

### New Capabilities
- `path-based-routing`: 基于请求路径和方法的能力路由判定与候选集构建。
- `upstream-route-capabilities`: 上游多能力声明、校验、存储与管理。

### Modified Capabilities
- `session-affinity`: 会话亲和性在路径能力路由下保持可用，并按能力类型保证绑定一致性。

## Impact

- 受影响后端：`src/app/api/proxy/v1/[...path]/route.ts`、`src/lib/services/model-router.ts`、`src/lib/services/load-balancer.ts`、`src/lib/services/request-logger.ts`。
- 受影响数据模型：`upstreams` 表与上游 CRUD 结构需新增多能力字段并提供迁移。
- 受影响 API/类型：`src/types/api.ts` 与 admin upstream 接口请求/响应结构。
- 受影响前端：上游管理页的创建/编辑表单与展示逻辑需支持多能力配置及图标化能力标签展示。
- 测试影响：代理路由、故障转移、上游管理、日志决策相关单元与集成测试需扩展。
