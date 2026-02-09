## Why

当前的上游分组（upstream groups）机制与用户实际使用场景脱节。用户的核心需求是：按成本/优先级对上游分层，低优先级层作为高优先级层的降级兜底。而现有 group 机制按 provider 类型平铺分组，组内所有上游平等参与负载均衡，没有"逐层降级"的概念。同时 `providerType` 字段已经替代了 group 的分类职能，导致两套机制并存，增加了用户认知负担和代码维护成本。

## What Changes

- **新增** upstream 表 `priority` 字段（integer, 默认 0），数字越小优先级越高
- **重写** 路由核心逻辑：按 `providerType` 筛选 → 按 `priority` 分层 → 同层内按 `weight` 加权选择 → 该层全部熔断则降级到下一层
- **BREAKING** 移除 `upstreamGroups` 表及其全部 CRUD API（5 个端点）
- **BREAKING** 移除 upstream 表的 `groupId` 字段
- 移除前端 Groups tab 及相关组件（`upstream-group-dialog.tsx` 等）
- 移除 `selectUpstream(groupId)` 代码路径，统一使用 `selectFromProviderType` 并集成分层降级逻辑
- 移除 `strategy` 概念（统一使用 weighted 选择，weight 相同即等效 round_robin）
- `healthCheckInterval` / `healthCheckTimeout` 从 group 级别提升为全局配置（环境变量）
- 前端 upstream 管理页面重新设计，按 providerType 和 priority 层级直观展示

## Capabilities

### New Capabilities

- `tiered-routing`: 基于优先级的分层路由与降级机制 — 定义 priority 字段语义、分层选择算法、熔断降级规则

### Modified Capabilities

（无已有 specs）

## Impact

- **数据库**: 新增 `priority` 列，移除 `groupId` 列，删除 `upstream_groups` 表，需要 migration
- **API**: 移除 `/api/admin/upstreams/groups` 下全部端点（BREAKING）；upstream CRUD API 的请求/响应中 `groupId` 替换为 `priority`
- **路由核心**: `model-router.ts`、`load-balancer.ts` 重写选择逻辑
- **前端**: upstream 管理页面重构，移除 group 相关组件，新增 priority 层级展示
- **配置**: 新增 `HEALTH_CHECK_INTERVAL`、`HEALTH_CHECK_TIMEOUT` 环境变量
- **测试**: 路由、负载均衡、failover 相关测试需要重写
