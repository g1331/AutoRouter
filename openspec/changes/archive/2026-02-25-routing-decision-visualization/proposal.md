## Why

当前请求日志中的路由决策信息展示过于零散，用户难以直观理解决策过程。亲和性绑定状态、迁移决策、重试过程等关键信息要么缺失，要么分散在不同区域，导致调试和监控困难。需要重新设计决策信息的展示方式，采用时间线叙事让用户一眼看懂"发生了什么"。

## What Changes

- **数据库扩展**: 在 `request_logs` 表新增 `session_id`、`affinity_hit`、`affinity_migrated` 字段，用于持久化亲和性决策信息
- **日志记录增强**: 扩展请求日志接口，记录亲和性状态、迁移决策、故障转移耗时等元数据
- **时间线布局重构**: 将 `RoutingDecisionDisplay` 组件从两列布局改为时间线叙事布局，按①②③④⑤阶段展示完整决策链
- **亲和性信息展示**: 新增会话标识、绑定状态、迁移评估条件、决策理由的可视化展示
- **重试详情可视化**: 新增故障转移时间线，展示每次尝试的上游、时间戳、错误类型、耗时
- **缓存效果关联**: 将 Token 缓存命中与会话亲和性绑定关联展示，量化缓存优化效果

## Capabilities

### New Capabilities

- `backend-affinity-logging`: 后端亲和性信息持久化，扩展请求日志表结构和记录逻辑
- `decision-timeline-display`: 决策时间线前端组件，按阶段展示路由决策完整过程
- `retry-visualization`: 故障转移重试可视化，展示每次尝试的详细信息和耗时

### Modified Capabilities

- （无现有 spec 需要修改，此为纯新增功能）

## Impact

**受影响代码:**
- `src/lib/db/schema-pg.ts` / `schema-sqlite.ts`: 新增数据库字段
- `src/lib/services/request-logger.ts`: 扩展日志接口
- `src/app/api/proxy/v1/[...path]/route.ts`: 传递亲和性信息到日志
- `src/types/api.ts`: 扩展类型定义
- `src/components/admin/routing-decision-display.tsx`: 重构为时间线布局
- `src/components/admin/logs-table.tsx`: 适配新的组件接口
- `src/messages/en.json` / `zh-CN.json`: 新增 i18n 翻译

**数据库迁移:**
- 需要生成新的迁移文件，为 `request_logs` 表添加字段

**API 变更:**
- `RequestLogResponse` 类型扩展，新增亲和性相关字段（向后兼容）

**依赖:**
- 依赖已完成的 `session-affinity` 变更提供的亲和性计算逻辑
