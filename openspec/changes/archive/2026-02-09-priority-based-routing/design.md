## Context

当前系统有两套路由机制并存：

1. **Group-based routing**: `upstreamGroups` 表定义分组，upstream 通过 `groupId` 关联，组内按 `strategy`（round_robin/weighted/least_connections）选择
2. **Provider-type routing**: upstream 的 `providerType` 字段直接标识供应商类型，`selectFromProviderType()` 优先使用此路径，group 作为 fallback

两套机制导致用户困惑：创建 upstream 时不知道该设 `groupId` 还是 `providerType`。更关键的是，现有模型缺少**优先级分层**能力——用户希望按成本将上游分为 p0/p1/p2 层级，低层级全部熔断后自动降级到高层级。

**约束**:

- 双数据库支持（PostgreSQL + SQLite），schema 变更需同步两套
- 使用 Drizzle ORM，migration 通过 `pnpm db:generate` + `pnpm db:migrate`
- 前端使用 shadcn/ui + TanStack Query
- 现有 circuit breaker 是 per-upstream 的，状态存储在 `circuit_breaker_states` 表

## Goals / Non-Goals

**Goals:**

- 引入 `priority` 字段实现分层路由：同 providerType 下按 priority 分层，同层按 weight 加权选择，该层全部熔断则降级
- 移除 `upstreamGroups` 表及所有相关代码，简化数据模型
- 移除 upstream 的 `groupId` 字段
- 简化负载均衡策略为 weighted-only（weight 相同即等效 round_robin）
- 将 healthCheckInterval/healthCheckTimeout 提升为全局环境变量
- 重新设计前端 upstream 管理页面，按 providerType 和 priority 层级直观展示

**Non-Goals:**

- 不引入分布式负载均衡状态（Redis 等），保持当前 per-instance 内存状态
- 不改变 circuit breaker 的核心状态机逻辑（CLOSED/OPEN/HALF_OPEN）
- 不改变 proxy 端点的 URL 结构和请求格式
- 不改变 API key 授权模型（apiKeyUpstreams 关联表保持不变）
- 不改变 model → providerType 的映射逻辑（model-router 的 prefix 匹配保持不变）

## Decisions

### D1: upstream 表新增 `priority` 字段

- **类型**: integer, NOT NULL, DEFAULT 0
- **语义**: 数字越小优先级越高（0 = 最高优先级）
- **索引**: 新增复合索引 `(provider_type, priority)` 用于分层查询
- **替代方案**: 用 float 允许更灵活的插入 → 拒绝，integer 足够简单，用户可以用 0/10/20 留间隔

### D2: 分层路由算法

核心函数 `selectFromProviderType()` 重写为分层降级逻辑：

```
输入: providerType, excludeIds?, allowedUpstreamIds?
  1. 查询所有匹配 providerType 的 active upstream（带 circuit breaker 状态）
  2. 按 allowedUpstreamIds 过滤（API key 授权）
  3. 按 priority 升序分组: Map<priority, UpstreamWithCircuitBreaker[]>
  4. 从最低 priority 值（最高优先级）开始遍历:
     a. 过滤掉 excludeIds 中的 upstream
     b. 过滤掉 circuit breaker 状态为 OPEN 的 upstream
     c. 如果该层有可用 upstream → 按 weight 加权选择 → 返回
     d. 如果该层全部不可用 → 继续下一层
  5. 所有层都无可用 upstream → 抛出 NoHealthyUpstreamsError
```

- **替代方案**: 在 forwardWithFailover 中实现分层 → 拒绝，分层逻辑属于选择层而非转发层，保持职责分离
- **降级触发条件**: 该层所有 upstream 的 circuit breaker 为 OPEN **或** 在 excludeIds 中（即本次请求已尝试失败）。这意味着单次请求的 failover 也能跨层降级

### D3: 移除 LoadBalancerStrategy 枚举，统一使用 weighted

- 移除 `ROUND_ROBIN` 和 `LEAST_CONNECTIONS` 策略
- `selectWeightedWithHealthScore()` 作为唯一选择算法
- weight 全部相同时自然等效于 round_robin（随机均匀分布）
- 移除 `roundRobinIndex` 和 `connectionCounts` 内存状态
- **替代方案**: 保留 strategy 作为可选配置 → 拒绝，增加复杂度但用户不需要

### D4: 移除 upstreamGroups 表及相关代码

**数据库**:

- 删除 `upstream_groups` 表
- 删除 `upstreams.group_id` 列及其索引
- 删除 `upstreamGroupsRelations`
- 删除 `upstreamsRelations` 中的 `group` 关联
- 两套 schema（pg + sqlite）同步修改

**API 端点删除**:

- `GET /api/admin/upstreams/groups`
- `POST /api/admin/upstreams/groups`
- `GET /api/admin/upstreams/groups/[id]`
- `PUT /api/admin/upstreams/groups/[id]`
- `DELETE /api/admin/upstreams/groups/[id]`

**服务层清理**:

- `load-balancer.ts`: 移除 `selectUpstream(groupId)`、`getGroupUpstreams()`、`getUpstreamGroupById()`、`getUpstreamGroupByName()` 等 group 相关函数
- `load-balancer.ts`: `getUpstreamsByProviderType()` 移除 group fallback 路径
- `upstream-crud.ts`: 移除 group CRUD 函数
- `upstream-service.ts`: 移除 group 相关 re-exports

**类型清理**:

- 移除 `UpstreamGroup`、`NewUpstreamGroup` 类型导出
- `ProviderTypeSelectionResult` 移除 `groupName` 和 `routingType` 字段（不再有 group 路由类型）

### D5: 全局健康检查配置

从 group 级别提升为环境变量：

- `HEALTH_CHECK_INTERVAL` (integer, 默认 30 秒)
- `HEALTH_CHECK_TIMEOUT` (integer, 默认 10 秒)

在 `config.ts` 的 `configSchema` 中新增这两个字段。

### D6: request_logs 表清理

- `routing_type` 字段：移除 `'group'` 值，保留 `'provider_type'` 和 `'direct'`，新增 `'tiered'` 表示分层路由
- `group_name` 字段：废弃，新增 `priority_tier` (integer) 记录最终选中的 upstream 所在层级
- `lb_strategy` 字段：废弃（统一 weighted，无需记录）
- 注意：为避免破坏历史数据查询，旧字段保留但不再写入新值

### D7: forwardWithFailover 适配

`forwardWithFailover()` 的核心循环不需要大改。它已经通过 `excludeIds` 机制实现了 failover：

- 每次失败把 upstream id 加入 `failedUpstreamIds`
- 下次调用 `selectFromProviderType()` 时传入 excludeIds
- 新的分层逻辑在 `selectFromProviderType()` 内部处理降级

唯一变化：`ProviderTypeSelectionResult` 返回值中新增 `selectedTier: number` 字段，用于日志记录。

### D8: 前端重新设计

**移除**:

- Groups tab 及 `upstream-group-dialog.tsx` 组件
- upstream 表单中的 `group_id` 选择器

**新增/修改**:

- upstream 表单新增 `priority` 数字输入（默认 0）
- upstream 列表页重新设计：按 providerType 分区，每个区内按 priority 分层展示
- 每个层级显示为可视化的卡片/行组，标注 "P0"、"P1"、"P2" 等层级标签
- 层级内的 upstream 显示 weight、健康状态、circuit breaker 状态

**设计要求**:

- 不要平庸的纯表格，要有层级感和视觉区分
- 每个 providerType 区域用不同的视觉标识
- priority 层级之间有明确的视觉层次（如缩进、颜色渐变、分隔线）
- 熔断状态用醒目的颜色标识

### D9: Migration 策略

1. 新增 `priority` 列（default 0，不影响现有数据）
2. 将现有 upstream 的 `groupId` 对应的 group name 写入 `providerType`（如果 providerType 为空）
3. 删除 `group_id` 列
4. 删除 `upstream_groups` 表
5. 使用 Drizzle 的 `pnpm db:generate` 生成 migration，手动调整数据迁移步骤

**回滚策略**: migration 前备份数据库。由于是破坏性变更（删表删列），回滚需要从备份恢复。

## Risks / Trade-offs

- **[BREAKING] 现有 group API 消费者中断** → 这是有意为之的简化，文档中明确标注。如果有外部系统依赖 group API，需要提前通知迁移
- **[数据丢失] group 级别的 strategy 配置丢失** → 统一为 weighted 后不再需要。如果用户依赖 least_connections 策略，这是一个功能降级 → 当前判断用户不需要此功能
- **[性能] 分层查询增加一次排序** → 影响极小，upstream 数量通常在个位数到几十个级别，内存排序可忽略
- **[双 schema 同步] pg + sqlite 两套 schema 需要同步修改** → 已有先例，按现有模式操作即可
