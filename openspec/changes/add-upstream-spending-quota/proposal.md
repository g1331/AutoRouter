## Why

上游 AI 服务（如 Claude Opus、GPT-4 大上下文）的单次请求成本差异巨大，部分高价上游如果不加控制可能导致费用失控。管理员需要能够为每个上游设定消费限额，当累计花费到达设定值后自动停止向该上游路由请求，实现费用的主动控制而非事后补救。

## What Changes

- 为上游增加消费限额配置（限额金额、周期类型：每天/每月/滚动 N 小时）
- 引入 QuotaTracker 内存缓存，通过增量累加 + 定期 DB 校准实现高性能的限额检查
- 在 Load Balancer 的上游选择流程中新增 Quota 过滤环节，超额上游静默降级到下一可用上游
- 提供 Admin API 端点用于查询每个上游的限额使用状态（已消费、限额、百分比、重置/恢复时间）
- 在 Dashboard 上游管理页面展示限额进度条、超额标识和重置倒计时
- 上游创建/编辑表单新增限额配置区域

## Capabilities

### New Capabilities

- `upstream-spending-quota`: 上游消费限额的核心功能，包括限额配置（金额、周期类型）、运行时限额追踪与校准、Load Balancer 层的限额过滤、Admin API 查询接口，以及 Dashboard 展示（进度条、超额状态、重置倒计时）

### Modified Capabilities

- `upstream-route-capabilities`: 上游选择流程新增 Quota 过滤步骤，影响路由决策逻辑

## Impact

- **数据库**: `upstreams` 表新增 `spending_limit`、`spending_period_type`、`spending_period_hours` 字段，需要数据库迁移
- **后端服务**: 新增 `upstream-quota-tracker.ts` 服务；修改 `load-balancer.ts` 的 `performTieredSelection` 流程；修改 `billing-cost-service.ts` 在记账后通知 QuotaTracker
- **API**: 新增 `/api/admin/upstreams/quota-status` 端点；上游 CRUD API 扩展限额字段
- **前端**: 修改 `upstream-form-dialog.tsx` 增加限额配置表单；修改 `upstreams-table.tsx` 展示限额信息；新增限额进度条组件
- **国际化**: `en.json` / `zh.json` 新增限额相关翻译条目
