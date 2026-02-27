## Why

Codex CLI 通过请求头传递 `session_id`，但 Cloudflare 在传输过程中会剥离该头部，导致上游服务始终无法收到会话标识。虽然 commit 7647573 已实现从请求体中回退提取 `session_id`，但提取到的值从未被重新注入到发往上游的出站请求头中，会话亲和性在上游侧依然失效。此外，Cloudflare 内部路由头 `cf-ew-via` 当前未被过滤，会泄漏至上游服务。

## What Changes

- 新增出站头部补偿引擎：根据可配置规则，将从请求头或请求体中提取的字段重新注入到发往上游的请求头中
- 新增 `compensation_rules` 数据库表，存储内置与自定义补偿规则
- `request_logs` 表新增 `session_id_compensated` 与 `header_diff` 字段，记录每次请求的头部变更情况
- `session-affinity.ts` 的 `extractSessionId()` 返回值扩展为包含来源元数据 `{ sessionId, source }`
- `proxy-client.ts` 支持接收补偿头部参数，并在响应中返回 `headerDiff` 结构
- 修复 `cf-ew-via` 头部未被过滤的问题，将其加入基础设施头部过滤集合
- 新增 System > Header Compensation 管理页面，支持查看与管理补偿规则
- 日志详情面板新增头部差异可视化组件，路由决策时间线展示补偿来源标记

## Capabilities

### New Capabilities

- `session-header-compensation`：补偿引擎核心，包含规则加载、来源解析与头部注入逻辑
- `header-compensation-config`：补偿规则管理员界面，支持内置规则开关与自定义规则的增删改
- `request-header-observability`：请求日志中的头部差异记录与可视化展示

### Modified Capabilities

- `session-affinity`：`extractSessionId()` 返回值新增 `source` 字段，标识会话 ID 的提取来源（`header` 或 `body`）

## Impact

- **数据库**：`request_logs` 表新增 2 个字段；新增 `compensation_rules` 表；PostgreSQL 与 SQLite 均需迁移
- **后端**：`proxy-client.ts`、`session-affinity.ts`、`route.ts`、`request-logger.ts` 需修改；新增 `compensation-service.ts` 及对应管理 API 路由
- **前端**：新增 System 导航分组与 Header Compensation 页面；新增 `header-diff-panel.tsx` 组件；`routing-decision-timeline.tsx` 与 `logs-table.tsx` 需更新
- **国际化**：`en.json` 与 `zh.json` 需新增对应翻译键
- **测试**：补偿引擎、规则加载、头部差异计算均需覆盖单元测试
