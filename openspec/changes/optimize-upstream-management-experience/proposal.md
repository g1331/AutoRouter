## Why

当前上游管理页面以高密度表格为中心，配置语义、运行态信号和故障转移证据分散，导致用户需要记忆大量技术细节（例如 base URL 是否手动带 `/v1`）且难以快速判断容量状态。随着上游能力、限额与路由策略持续扩展，现有交互与信息结构已成为可用性瓶颈，需要一次面向运营体验的整体优化。

## What Changes

- 将上游 endpoint 配置从“手动记忆规则”改为“系统引导式配置”：
  - 支持按能力自动补全 `/v1`；
  - 当用户手动填写 `/v1` 且会重复时显示警告；
  - 提供最终请求地址预览框；
  - 支持配置并跳转上游官网地址。
- 引入上游并发上限能力（每上游 `max_concurrency`）：
  - 请求路由阶段识别实时并发占用；
  - 上游并发满载时不触发熔断，自动转移到其他可用上游；
  - 所有候选满载时返回明确的容量不足错误。
- 扩展路由与日志可观测性：
  - 记录“并发满导致转移”的排除原因与失败尝试类型；
  - 在日志时间线中展示并发满转移链路与转移结果。
- 重构上游管理页视觉与信息架构：
  - 从表格主导改为面向运营的分层卡片工作台；
  - 统一桌面与移动的信息语义与结构；
  - 将“创建时间”替换为“最近一次使用时间（last used）”。

## Capabilities

### New Capabilities
- `upstream-endpoint-experience`: 上游 endpoint 的自动补全、重复警告、请求地址预览和官网跳转能力。
- `upstream-concurrency-control`: 每上游并发上限、满载无熔断转移、容量不足错误语义与运行态占用展示。
- `upstream-operations-workbench`: 上游管理页面的卡片化工作台重构、运行态信息聚合、last used 展示与视觉层级优化。
- `routing-failover-observability`: 路由与日志中新增并发满转移原因、时间线展示与可追溯证据。

### Modified Capabilities
- `upstream-route-capabilities`: 路由候选筛选阶段新增并发容量过滤语义，并明确“容量满载 ≠ 上游故障/熔断”的行为边界。

## Impact

- 前端页面与组件：
  - `src/app/[locale]/(dashboard)/upstreams/page.tsx`
  - `src/components/admin/upstreams-table.tsx`
  - `src/components/admin/upstream-form-dialog.tsx`
  - `src/components/admin/routing-decision-timeline.tsx`
  - `src/components/admin/logs-table.tsx`
- 后端路由与服务：
  - `src/app/api/proxy/v1/[...path]/route.ts`
  - `src/lib/services/load-balancer.ts`
  - `src/lib/services/request-logger.ts`
  - `src/lib/services/failover-config.ts`
- API 与类型：
  - `src/app/api/admin/upstreams/*.ts`
  - `src/types/api.ts`
  - `src/lib/utils/api-transformers.ts`
- 数据模型与迁移：
  - `src/lib/db/schema-pg.ts`
  - `src/lib/db/schema-sqlite.ts`
  - `drizzle/*`（新增迁移以支持新字段）
