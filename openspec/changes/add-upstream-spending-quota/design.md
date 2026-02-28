## Context

AutoRouter 作为 AI API 网关，管理多个上游 AI 服务提供商。不同上游的请求成本差异巨大（如 Claude Opus 大上下文单次请求可达 $2+），管理员需要对高价上游设定消费上限以防止费用失控。

当前系统已具备完整的计费基础设施：

- `requestBillingSnapshots` 表记录每次请求的 `finalCost`（精确到 upstream 维度）
- `billingModelPrices` / `billingManualPriceOverrides` 提供模型价格
- `billing-cost-service.ts` 的 `calculateAndPersistRequestBillingSnapshot` 在每次代理请求完成后计算并持久化费用
- `billing-management-service.ts` 已有按时间范围聚合费用的查询模式

上游选择流程（`load-balancer.ts` 的 `performTieredSelection`）目前执行：按 priority 分层 → circuit breaker 过滤 → exclusion 过滤 → weighted random 选择。需要在此流程中插入 quota 过滤步骤。

## Goals / Non-Goals

**Goals:**

- 管理员可以为每个上游配置消费限额（金额 + 周期类型）
- 支持三种周期类型：每天（daily）、每月（monthly）、滚动 N 小时（rolling）
- 超额上游在路由选择时被静默排除，请求自动降级到下一可用上游
- Dashboard 展示每个上游的消费进度、超额状态和重置/恢复倒计时
- 限额检查性能足够高，不影响代理请求延迟

**Non-Goals:**

- API Key 级别的独立消费限额（后续扩展）
- 超额预警通知（如邮件/Webhook，后续扩展）
- 费用预扣机制（乐观并发控制，当前场景不需要）
- 限额使用趋势图表（后续扩展）

## Decisions

### 决策 1: 限额配置存储在 upstreams 表内

**选择**: 在 `upstreams` 表新增三个字段，而非创建独立的 quota 配置表。

**理由**: 消费限额是上游的固有属性，与 `priority`、`weight`、`billingInputMultiplier` 同级。一个上游一条配置，schema 层语义清晰，查询无需 JOIN，CRUD 复用已有的上游管理流程。

**替代方案**: 独立 `upstream_quotas` 表 —— 支持更灵活的多维度限额（如按 API Key + 上游），但对当前需求过度设计。

新增字段:

```
upstreams 表
├── spending_limit          DOUBLE PRECISION  (null = 无限额)
├── spending_period_type    VARCHAR(16)       ('daily' | 'monthly' | 'rolling')
└── spending_period_hours   INTEGER           (仅 rolling 类型生效，如 24, 72)
```

### 决策 2: 增量累加 + 定期 DB 校准的混合精度模型

**选择**: 内存 QuotaTracker 维护每个上游的累计花费，通过两条路径更新：

1. **增量路径**（实时）: `billing-cost-service.ts` 每次计费完成后调用 `QuotaTracker.recordSpending(upstreamId, finalCost)` 即时累加
2. **校准路径**（定期）: 从 DB 重新聚合 `SUM(finalCost)` 来修正累积误差和实现滚动窗口的「滑出」

**理由**: 纯 DB 查询在每次代理请求前执行 `SUM` 聚合不可接受（高延迟）；纯内存累加无法处理滚动窗口的旧请求滑出。混合方案在增量路径（零延迟）和校准路径（数据一致性）之间取得平衡。

**替代方案**:

- 纯 DB 查询: 精确但每次请求前的额外查询影响延迟
- 分桶近似: 实现复杂且存在可感知的精度误差（单次请求可达 $2+）
- Redis 缓存: 引入外部依赖，对单实例部署过度

### 决策 3: 智能校准频率

**选择**: 根据上游当前消费占限额的比例动态调整校准频率：

| 消费占比 | 校准间隔 | 说明 |
|----------|----------|------|
| < 80% | 5 分钟 | 常态，低 DB 压力 |
| >= 80% | 1 分钟 | 临近限额时提高精度 |
| >= 100%（超额中） | 1 分钟 | 检测何时因滑出恢复到限额以内 |

**理由**: 离限额远时粗略校准即可（节省 DB 查询），接近限额时自动加精度（减少超额风险），超额后频繁检查（确保及时恢复）。

### 决策 4: Quota 过滤插入 performTieredSelection 中 CB 过滤之后

**选择**: 在 `filterByCircuitBreaker()` 之后、`filterByExclusions()` 之前插入 `filterBySpendingQuota()` 调用。

```
performTieredSelection() 内的过滤顺序:
├── filterByCircuitBreaker()       ← 故障保护（最高优先级）
├── filterBySpendingQuota()        ← 费用控制（新增）
├── filterByExclusions()           ← 手动排除
└── selectWeightedWithHealthScore()
```

**理由**: Circuit breaker 是系统安全机制，必须最先过滤。Quota 是业务层费用控制，在 CB 之后但在手动排除之前。这样被 CB 排除的上游不会参与 quota 计算流程，避免无谓计算。

### 决策 5: Dashboard 限额展示方案

**选择**: 在上游列表的每行中嵌入限额进度信息，而非独立的 quota 页面。

**上游表格行内展示**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Name            Priority  Weight  Capabilities   Quota        Status   │
├─────────────────────────────────────────────────────────────────────────┤
│ Claude-Premium  0         3       [chat][comp]   ▓▓▓▓▓░ 72%  Active   │
│                                                  $36/$50 月             │
│                                                  30天后重置              │
├─────────────────────────────────────────────────────────────────────────┤
│ GPT4-Main       0         5       [chat]         ▓▓▓▓▓▓▓▓▓▓ 100%     │
│                                                  $100/$100 日  超额!   │
│                                                  8小时后重置             │
├─────────────────────────────────────────────────────────────────────────┤
│ OpenAI-Backup   1         2       [chat]         无限额       Active   │
└─────────────────────────────────────────────────────────────────────────┘
```

**理由**: 限额信息是上游运行状态的一部分，管理员在查看上游列表时最需要这个信息的可见性。独立页面增加跳转成本。

### 决策 6: Quota Status API 设计

**选择**: 新增 `GET /api/admin/upstreams/quota-status` 返回所有有限额配置的上游的当前消费状况。

```typescript
interface UpstreamQuotaStatus {
  upstreamId: string;
  upstreamName: string;
  spendingLimit: number;
  spendingPeriodType: 'daily' | 'monthly' | 'rolling';
  spendingPeriodHours: number | null;
  currentSpending: number;
  percentUsed: number;
  isExceeded: boolean;
  resetsAt: Date | null;       // 固定窗口: 下次重置时间
  estimatedRecoveryAt: Date | null; // 滚动窗口: 预计恢复到限额内的时间
}
```

**理由**: 与现有的 `GET /api/admin/upstreams/health` 模式一致，返回运行时状态而非配置。前端可以轮询此接口更新进度条。

### 决策 7: 滚动窗口的「预计恢复时间」计算

**选择**: 查询窗口起始边缘附近最早的计费记录，估算最早一批花费何时滑出窗口。

```
滚动 24h 窗口，当前超额 $5:
→ 查询 [now-24h, now-24h+1h] 范围内的消费总和
→ 如果该范围内的消费 >= $5，则预计 1 小时内恢复
→ 否则继续扩大查询范围
```

**理由**: 无需精确到秒（费用控制场景），区间估算对用户足够有用。

## Risks / Trade-offs

**[并发超额]** → 同时到达的多个请求可能都通过 quota 检查后导致超额。超额量最坏约等于 `max(单次请求费用) * (并发数 - 1)`。对于当前使用规模（个人/小团队），超额 $5-10 可接受。如果未来需要严格控制，可以引入「预扣额度」机制。

**[进程重启丢失内存状态]** → QuotaTracker 内存缓存在进程重启后丢失。启动时执行全量 DB 校准恢复状态，短暂窗口内（DB 校准完成前）所有上游被视为「未超额」。风险可控，因为校准在秒级完成。

**[unbilled 请求不计入限额]** → 模型价格未配置的请求不会被计入消费。如果频繁出现 unbilled 请求，实际费用可能高于限额追踪值。缓解措施：billing 管理页面已有 unresolved model 的提示，管理员应及时配置价格。

**[双 schema 同步]** → PG 和 SQLite schema 需要同步新增字段。遗漏任一将导致对应数据库类型运行时出错。通过 migration 文件和类型检查覆盖此风险。

## Migration Plan

1. 生成 Drizzle 数据库迁移，为 `upstreams` 表新增三个 nullable 字段
2. 无需数据回填——现有上游默认无限额（`spending_limit = null`）
3. 功能为纯增量，不影响现有行为；未配置限额的上游完全不受影响
4. 回滚策略：撤销迁移删除字段，QuotaTracker 不加载即可

## Open Questions

（已在 explore 阶段全部确认，无遗留问题）
