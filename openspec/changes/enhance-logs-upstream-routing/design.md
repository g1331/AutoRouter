## Context

AutoRouter 的代理层支持三种路由方式：

1. **直接路由** - 通过 `X-Upstream-Name` 指定具体上游
2. **组负载均衡** - 通过 `X-Upstream-Group` 使用组内负载均衡（支持 round_robin/weighted/least_connections）
3. **默认路由** - 自动选择默认或第一个可用上游

组路由还支持 failover 机制：当上游返回 5xx 或超时时，自动尝试组内其他健康上游（最多 3 次）。

当前 `request_logs` 表只存储最终使用的 `upstream_id`，缺少路由过程的可追溯性。

## Goals / Non-Goals

**Goals:**

- 记录完整的路由决策信息（类型、组名、策略）
- 记录 failover 过程（尝试的上游、失败原因）
- UI 展示上游名称和路由详情
- 保持向后兼容，新字段使用可空默认值

**Non-Goals:**

- 不改变路由逻辑本身
- 不存储请求/响应内容
- 不实现实时路由监控 dashboard（仅历史日志查询）

## Decisions

### Decision 1: 数据库字段设计

新增字段到 `request_logs` 表：

| 字段                | 类型          | 说明                                 |
| ------------------- | ------------- | ------------------------------------ |
| `routing_type`      | `varchar(16)` | 路由类型：`direct`/`group`/`default` |
| `group_name`        | `varchar(64)` | 使用的组名（仅 group 路由时有值）    |
| `lb_strategy`       | `varchar(32)` | 负载均衡策略（仅 group 路由时有值）  |
| `failover_attempts` | `integer`     | failover 尝试次数（0 表示首次成功）  |
| `failover_history`  | `text`        | JSON 格式的 failover 历史            |

**Rationale**:

- 使用独立字段而非单一 JSON 便于查询和索引
- `failover_history` 使用 JSON text 因为结构复杂且主要用于详情展示

**Alternative considered**: 全部存为一个 JSON 字段

- 优点：灵活
- 缺点：无法按路由类型筛选，查询性能差

### Decision 2: Failover History JSON 结构

```typescript
interface FailoverAttempt {
  upstream_id: string;
  upstream_name: string;
  attempted_at: string; // ISO timestamp
  error_type: "timeout" | "http_5xx" | "http_429" | "connection_error";
  error_message: string;
  status_code?: number;
}
```

**Rationale**: 记录足够信息用于排查，但不存储响应内容避免数据膨胀

### Decision 3: API 返回上游名称

在 `listRequestLogs` 查询时 JOIN `upstreams` 表获取名称，而非存储时冗余。

**Rationale**:

- 上游名称可能变更，JOIN 获取始终是最新的
- 减少存储冗余
- 上游删除后显示为 "Unknown" 或 ID

**Alternative considered**: 记录时存储 upstream_name

- 优点：历史准确性
- 缺点：数据冗余，上游改名后历史记录混乱

### Decision 4: UI 展示方案

- 日志表新增 "Upstream" 列，显示上游名称 + 路由类型标签
- Failover 详情使用可展开行（Accordion/Collapsible）
- 仅当 `failover_attempts > 0` 时显示展开按钮

**Rationale**: 保持表格简洁，详情按需展开

## Risks / Trade-offs

**[Risk] 数据库 migration 可能影响现有数据**
→ 新字段全部使用 nullable 或带默认值，现有记录保持 null

**[Risk] failover_history JSON 可能过大**
→ 最多 3 次尝试，每次约 200 bytes，可控

**[Risk] JOIN 查询性能**
→ upstreams 表通常很小（<100条），JOIN 开销可忽略

**[Trade-off] 上游删除后的显示**
→ 选择显示 "Unknown" + ID，而非保留历史名称，接受这个权衡
