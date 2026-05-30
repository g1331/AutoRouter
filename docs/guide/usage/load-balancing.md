---
title: 负载均衡与权重
outline: deep
---

# 负载均衡与权重

当同一个 `RouteCapability` 下有多条上游候选时，AutoRouter 决定把这次请求发给谁。本页讲清楚四件事：每条上游的 `weight` 与 `priority` 字段语义、加权随机叠加延时分的选路算法、会话亲和如何让同一会话粘到同一上游、熔断与并发限制怎么提前把候选剔除掉。

把握一个总原则：当前实现**只有一种选路策略**——「先按 priority 分层、同层内加权随机叠加延时分」。代码里没有 round-robin、least-connections 之类的备选策略（管理后台的 i18n 翻译文件里出现过相关字符串，但服务端没有任何实现引用它们）。

## 上游字段与 UI

`upstreams` 表里与选路直接相关的字段（`src/lib/db/schema-pg.ts:74`）：

| DB 字段              | 类型      | 默认值      | UI 名称                    | 范围      |
| -------------------- | --------- | ----------- | -------------------------- | --------- |
| `weight`             | `integer` | `1`         | Weight                     | 1–100     |
| `priority`           | `integer` | `0`         | Priority Tier              | 0–100     |
| `max_concurrency`    | `integer` | `null` 无限 | Max Concurrency            | 整数 / 无 |
| `queue_policy`       | `json`    | `null`      | Queue Policy               | 见下文    |
| `affinity_migration` | `json`    | `null`      | Session Affinity Migration | 见下文    |
| `is_active`          | `boolean` | `true`      | Active                     | 开关      |

`priority` 字段不是凭名字猜的——它真实存在于 schema 并有专属索引（`src/lib/db/schema-pg.ts:126`）。UI 提示直接说明（`src/messages/en.json:744`）：「Lower number = higher priority. Tier 0 is tried first, then tier 1, etc.」；权重的语义是（`src/messages/en.json:747`）：「Higher weight = more requests routed to this upstream within the same tier」。

简记：**priority 决定优先级层、weight 决定同层内的比例**。

## 选路算法

`src/lib/services/load-balancer.ts` 是核心模块。最常被调用的入口是 `selectFromProviderType`（`load-balancer.ts:643`）与 `selectFromUpstreamCandidates`（`:675`），它们内部走 `performTieredSelection`（`:983`）。

`performTieredSelection` 按 `priority` 升序把候选分成多个 tier，从 tier 0 开始逐层尝试，每个 tier 内做以下过滤与选择：

| 顺序 | 处理                                   | 函数                                      |
| ---- | -------------------------------------- | ----------------------------------------- |
| 1    | 去掉熔断 OPEN / HALF_OPEN 未到期的上游 | `filterByCircuitBreaker`（`:243`）        |
| 2    | 去掉超过 spending quota 的上游         | `filterBySpendingQuota`（`:325`）         |
| 3    | 去掉调用方传入的 excludeIds            | `filterByExclusions`（`:309`）            |
| 4    | 去掉并发已满的上游                     | `filterByConcurrencyCapacity`（`:451`）   |
| 5    | 剩余候选进入加权随机选择               | `selectWeightedWithHealthScore`（`:485`） |

第 4 步过滤掉并发已满的上游时，开启了 `queue_policy.enabled` 的上游不会被直接丢弃，而是进入 `waitableCandidates` 集合（`load-balancer.ts:1049-1058`）；如果所有 tier 都没选出可用候选，再从 `waitableCandidates` 里挑一个排队等待槽位。

### 加权随机叠加延时分

`selectWeightedWithHealthScore`（`load-balancer.ts:485`）的核心计算：

```
score = 1.0
if latencyMs > 0:
    latencyPenalty = min(latencyMs / 500, 0.5)   # 至多扣 0.5
    score -= latencyPenalty
score = max(score, 0.1)                          # 至少保留 0.1
effectiveWeight = upstream.weight * score
```

举例（同一 tier 内）：

| 上游 | weight | latencyMs | latencyPenalty | score | effectiveWeight |
| ---- | ------ | --------- | -------------- | ----- | --------------- |
| A    | 10     | 0         | 0              | 1.0   | 10              |
| B    | 10     | 100       | 0.2            | 0.8   | 8               |
| C    | 10     | 250       | 0.5            | 0.5   | 5               |
| D    | 10     | 800       | 0.5（封顶）    | 0.5   | 5               |

最终按 `effectiveWeight` 总和做加权轮盘（`load-balancer.ts:514-521`）。**延时分对权重的最大影响是减半**，不会把某条上游完全排除掉。当所有候选的 `effectiveWeight` 加起来为 0 时，退化为纯随机选一个（`:509-511`）。

### 延时数据从哪来

`latencyMs` 不是请求级别的滑动平均，而是**上一次后台健康检查测到的单次 RTT**：

- 来源字段：`upstream_health.latency_ms`（`schema-pg.ts:145`，`integer`，可空）。
- 写入逻辑：`checkUpstreamHealth` 调用 `testUpstreamConnection` 测真实 RTT（`src/lib/services/health-checker.ts:302-314`），然后 `updateHealthStatus(upstreamId, success, latencyMs)` 直接覆盖写入（`:155-226`，无滚动平均）。
- 触发频率：`background-sync` 调度器按 `HEALTH_CHECK_INTERVAL` 调用，默认 30 秒（`src/lib/utils/config.ts:38`）。

也就是说：上游真实延时上下波动比较剧烈时，`latencyMs` 反应有滞后；不要期望它能在毫秒级别区分上游。

## 会话亲和（Session Affinity）

`src/lib/services/session-affinity.ts` 让同一会话尽可能粘到同一上游，对话类场景（CoT、连续 turn）尤其重要。

### 触发条件

只有当请求里能提取出 `sessionId` 时才会触发。提取规则按协议而异（`session-affinity.ts:283`）：

- **Anthropic 协议**：`body.metadata.user_id` 含 `_session_{uuid}` 格式（`:308-329`）。
- **OpenAI 协议**：优先看 header `session_id` / `session-id` / `x-session-id`；其次看 body 的 `prompt_cache_key` / `metadata.session_id` / `previous_response_id`（`:343-377`）。
- 同时调用方还需传入 `affinityContext`（含 `apiKeyId`、`contentLength`、`affinityScope`，见 `load-balancer.ts:647`）。

满足条件后，AutoRouter 在内存 Map 里查 `(apiKeyId, scope, sessionId) → upstreamId` 的绑定，命中则跳过加权随机直接用该上游。

### TTL 与容量

`session-affinity.ts:39-41`：

- **滑动 TTL**：5 分钟无访问过期。
- **绝对 TTL**：30 分钟（即使一直被命中也会过期，避免会话永远粘死在某个上游）。
- **最大条目数**：10,000，LRU 驱逐。

注意亲和缓存只在内存里，**进程重启会丢**。

### 绑定上游不可用时

当亲和命中的目标上游被 `excludeIds` 排除、熔断 OPEN 未到期、配额超限或并发已满时，AutoRouter 不会强行等待——而是**跳过亲和、走普通的 tiered 选路**（`load-balancer.ts:810-932`）。重要细节：这种情况下**不清除亲和缓存**（注释 `:931`），下次请求若目标上游恢复仍可能命中原绑定。

如果想让某个 sessionId 主动「换上游」，目前只能等亲和 TTL 自然过期，没有专门的 admin 接口去清空。

### 与负载均衡的顺序

`selectFromUpstreamPool`（`load-balancer.ts:764`）的顺序：

1. 先看亲和缓存——命中且可用就返回。
2. 命中但目标更高 priority 上游可用时，按 `shouldMigrate`（`session-affinity.ts:413`，由 `load-balancer.ts:973` 调用）判断是否迁移（具体由上游的 `affinity_migration` 字段控制，例如同一 tier 不迁移、跨 tier 迁移、内容长度阈值之类）。
3. 亲和未命中或不可用——降级到 `performTieredSelection`。

## 熔断与并发对选路的影响

### 熔断器

`filterByCircuitBreaker`（`load-balancer.ts:243`）严格按下表过滤候选：

| 熔断器状态  | 条件                       | 动作                          |
| ----------- | -------------------------- | ----------------------------- |
| `CLOSED`    | 任何时候                   | 允许通过                      |
| `OPEN`      | `elapsed < openDuration`   | 排除                          |
| `OPEN`      | `elapsed >= openDuration`  | 允许（自动转 HALF_OPEN 试探） |
| `HALF_OPEN` | `elapsed < probeInterval`  | 排除                          |
| `HALF_OPEN` | `elapsed >= probeInterval` | 允许（探针请求）              |
| 未知状态    | —                          | 宽松允许（`:298-300`）        |

熔断与失败规则的详细配置见 [熔断器配置](./circuit-breaker-config)。

### 并发槽位

`upstream-queue-admission.ts` 维护一个内存 `UpstreamQueueAdmissionService`（`:123`），按 `max_concurrency` 限流：

- `max_concurrency == null` → 无限制。
- `activeCount >= maxConcurrency` 且 `queue_policy.enabled` 为 false → `filterByConcurrencyCapacity` 直接把它从候选剔除。
- `activeCount >= maxConcurrency` 且 `queue_policy.enabled` 为 true → 进入 `waitableCandidates`，所有 tier 都无可用候选时再从这里选一个去等待槽位（如果 `queue.length >= maxQueueLength` 直接拒绝并报 `queue_full`，见 `upstream-queue-admission.ts:174`）。

`queue_policy` 自身的字段：`enabled`、`timeout_ms`（等待槽位的超时）、`max_queue_length`（队列上限）。

## 一次典型选择的全流程

把上面拼成一次实际选择：

```
请求 → RouteCapability → 初始候选集合（声明该能力 + 活跃）
  ↓
Key.allowed_models 白名单 / 受限模式 apiKeyUpstreams 过滤
  ↓
按 priority 分 tier，逐层尝试
  ┌── 当前 tier ───────────────────────────────┐
  │ filterByCircuitBreaker（OPEN / HALF_OPEN 未到期 → 跳过） │
  │ filterBySpendingQuota（quota 已满 → 跳过） │
  │ filterByExclusions（在排除列表 → 跳过）     │
  │ filterByConcurrencyCapacity（并发已满 → 跳过 或 进入 waitable） │
  │ ─────────────                              │
  │ 若亲和命中且可用 → 直接返回                │
  │ 否则 selectWeightedWithHealthScore         │
  │   effectiveWeight = weight * max(1 - min(latencyMs/500, 0.5), 0.1) │
  │   加权轮盘抽中一个                          │
  └────────────────────────────────────────────┘
  ↓
本 tier 无候选 → 进入下一 tier，最低优先级失败后从 waitable 选一个排队
  ↓
仍无候选 → 抛 AllCandidatesConcurrencyFullError 或 ROUTE_NO_UPSTREAM_AVAILABLE
```

## 调参建议

- **想让某条上游接管所有流量**：在它独自所在的 tier（最低数字），且其他上游放更高数字的 tier；它故障时自动降级到下一 tier。
- **想在两条等价上游之间按比例分流**：放同一 tier，按比例设 `weight`。例如 30:70 → `weight = 3, 7`（也能写 30:70，加权随机不受绝对值影响）。
- **想限制单上游并发**：设 `max_concurrency`；并发紧张时配合 `queue_policy` 决定是排队还是直接换上游。
- **想让对话粘到同一上游**：客户端在请求里带 sessionId（OpenAI 用 `prompt_cache_key` 或 header；Anthropic 用 `metadata.user_id` 中嵌 `_session_{uuid}`），AutoRouter 自动绑定。
- **想让某些 sessionId 跨 tier 迁移**：配置 `affinity_migration` 字段。

## 不在本页范围内

- 失败转移与熔断状态机细节：见 [熔断器配置](./circuit-breaker-config) 与 [`docs/circuit-breaker.md`](/circuit-breaker)。
- 模型字段与上游 model_rules 的匹配：见 [模型路由规则](./model-routing)。
- 一次请求从入口到响应的全流程：见 [请求生命周期](../architecture/request-lifecycle)。
- spending quota / 计费规则的具体语义：后续「请求日志与统计」「计费」相关文档。
