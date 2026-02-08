## 1. Database Schema 变更

- [x] 1.1 在 `schema-pg.ts` 和 `schema-sqlite.ts` 的 upstreams 表新增 `priority` 字段（integer, NOT NULL, DEFAULT 0），新增复合索引 `(provider_type, priority)`
- [x] 1.2 从 `schema-pg.ts` 和 `schema-sqlite.ts` 移除 `upstreamGroups` 表定义及 `upstreamGroupsRelations`
- [x] 1.3 从 upstreams 表移除 `groupId` 字段及其索引，移除 `upstreamsRelations` 中的 group 关联
- [x] 1.4 从 `schema.ts` 移除 `upstreamGroups` 相关导出（表、关系、类型）
- [x] 1.5 在 `config.ts` 的 `configSchema` 新增 `healthCheckInterval`（默认 30）和 `healthCheckTimeout`（默认 10）环境变量
- [x] 1.6 在 request_logs 表新增 `priority_tier` 字段（integer, nullable）
- [x] 1.7 生成并验证 Drizzle migration（`pnpm db:generate`）
- [x] 1.8 编写 schema 变更的单元测试（priority 默认值、非负校验）

## 2. 服务层 — Group 代码移除

- [x] 2.1 从 `upstream-crud.ts` 移除所有 group CRUD 函数
- [x] 2.2 从 `upstream-service.ts` 移除 group 相关 re-exports
- [x] 2.3 从 `load-balancer.ts` 移除 `selectUpstream(groupId)`、`getGroupUpstreams()`、`getUpstreamGroupById()`、`getUpstreamGroupByName()` 等 group 相关函数
- [x] 2.4 从 `load-balancer.ts` 的 `getUpstreamsByProviderType()` 移除 group fallback 路径
- [x] 2.5 移除 `LoadBalancerStrategy` 枚举中的 `ROUND_ROBIN` 和 `LEAST_CONNECTIONS`，移除 `roundRobinIndex` 和 `connectionCounts` 内存状态
- [x] 2.6 从 `health-checker.ts` 移除 group 级别的 healthCheckInterval/healthCheckTimeout 引用，改用全局 config
- [x] 2.7 清理所有引用已删除函数/类型的 import

## 3. 服务层 — 分层路由核心实现

- [x] 3.1 重写 `selectFromProviderType()` 实现分层降级算法：按 priority 分组 → 逐层尝试 → 同层 weighted 选择 → 全部不可用则降级
- [x] 3.2 `ProviderTypeSelectionResult` 返回值新增 `selectedTier: number`，移除 `groupName` 和 `routingType`
- [x] 3.3 upstream CRUD 的创建/更新接口支持 `priority` 字段，增加非负整数校验
- [x] 3.4 适配 `forwardWithFailover()` 使用新的 `selectFromProviderType()` 返回值，将 `selectedTier` 写入 request log
- [x] 3.5 适配 `request-logger.ts` 记录 `priority_tier` 字段
- [x] 3.6 编写分层路由核心算法的单元测试（覆盖 specs 中的全部 16 个场景）

## 4. API 端点变更

- [x] 4.1 删除 `src/app/api/admin/upstreams/groups/` 目录下所有路由文件
- [x] 4.2 修改 upstream CRUD API（create/update）支持 `priority` 字段，移除 `groupId` 字段
- [x] 4.3 修改 upstream list/get API 响应中包含 `priority`，移除 `groupId`
- [x] 4.4 更新 `src/types/api.ts` 中的相关类型定义
- [x] 4.5 编写 API 端点测试（priority 字段 CRUD、group 端点 404）

## 5. 前端 — Group 组件移除

- [x] 5.1 删除 `upstream-group-dialog.tsx` 组件
- [x] 5.2 从 upstream 管理页面移除 Groups tab
- [x] 5.3 从 upstream 表单移除 `group_id` 选择器
- [x] 5.4 移除 `useAllUpstreamGroups()` 等 group 相关 hooks
- [x] 5.5 清理 `src/messages/` 中 group 相关的 i18n 翻译条目（en.json, zh.json）

## 6. 前端 — Upstream 管理页面重新设计

- [x] 6.1 upstream 表单新增 `priority` 数字输入控件（默认 0）
- [x] 6.2 重新设计 upstream 列表页：按 providerType 分区展示，每个区域有视觉标识
- [x] 6.3 每个 providerType 区域内按 priority 分层展示，层级标签（P0/P1/P2）有明确视觉层次
- [x] 6.4 层级内 upstream 卡片展示 weight、健康状态、circuit breaker 状态，熔断状态用醒目颜色标识
- [x] 6.5 更新 i18n 翻译条目（en.json, zh.json）新增 priority 相关文案
- [x] 6.6 前端交互测试：创建/编辑 upstream 的 priority 字段、列表页分层展示

## 7. 集成测试与清理

- [x] 7.1 端到端测试：请求经过分层路由 → 同层 weighted 选择 → 熔断降级到下一层
- [x] 7.2 清理已有测试中引用 group 的测试用例
- [x] 7.3 运行完整测试套件确认无回归（`pnpm test:run`）
- [x] 7.4 运行 lint 和类型检查（`pnpm lint && pnpm exec tsc --noEmit`）
