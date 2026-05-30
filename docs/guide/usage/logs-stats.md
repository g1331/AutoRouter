---
title: 请求日志与统计
outline: deep
---

# 请求日志与统计

AutoRouter 的可观测性建立在两张表上：`request_logs` 记录每一次代理请求的完整过程，`request_billing_snapshots` 与它 1:1 关联存计费快照。两张表通过统一的 admin API 暴露给管理后台与外部脚本，三类聚合 API（overview / timeseries / leaderboard）在它们之上做实时计算，无任何预聚合。本页讲清字段语义、写入时机、统计口径、live SSE、以及 `LOG_RETENTION_DAYS` 当前实际的执行情况。

## request_logs 表

`src/lib/db/schema-pg.ts:279-342` 定义。**40 多列**，按功能分组列出关键字段：

### 调用方与上游标识

| 列               | 类型                           | 说明                                             |
| ---------------- | ------------------------------ | ------------------------------------------------ |
| `api_key_id`     | uuid FK → api_keys (set null)  | Key 被删除后置 NULL，但 prefix/name 快照仍可用   |
| `api_key_name`   | varchar(255)                   | Key 名称快照（冗余写入，避免 join 时被改名误导） |
| `api_key_prefix` | varchar(16)                    | Key 前缀快照                                     |
| `upstream_id`    | uuid FK → upstreams (set null) | 实际命中的上游                                   |

### 请求 / 响应骨架

| 列                    | 类型         | 说明                                                                        |
| --------------------- | ------------ | --------------------------------------------------------------------------- |
| `method`              | varchar(10)  | HTTP 方法                                                                   |
| `path`                | text         | 完整路径                                                                    |
| `model`               | varchar(128) | 模型名（来自请求体或响应体）                                                |
| `status_code`         | integer      | HTTP 状态码；**in-progress 时为 NULL**，请求完成后才回填                    |
| `duration_ms`         | integer      | 总耗时（ms），写入时 clamp 到 INT4 上限 2,147,483,647（约 24.8 天）防止溢出 |
| `routing_duration_ms` | integer      | 路由选择耗时（ms），同样 clamp                                              |
| `ttft_ms`             | integer      | Time-To-First-Byte（首字节时延 ms）                                         |
| `is_stream`           | boolean      | 是否为流式请求                                                              |
| `error_message`       | text         | 错误描述（仅失败时填）                                                      |

### Token 与缓存计费维度

| 列                         | 含义                                  |
| -------------------------- | ------------------------------------- |
| `prompt_tokens`            | 输入 token                            |
| `completion_tokens`        | 输出 token                            |
| `total_tokens`             | 总数（通常 = prompt + completion）    |
| `cached_tokens`            | OpenAI 侧 `usage.cached_tokens`       |
| `reasoning_tokens`         | 推理 token                            |
| `cache_creation_tokens`    | Anthropic cache 写入（通用）          |
| `cache_creation_5m_tokens` | Anthropic 5 分钟 ephemeral cache 写入 |
| `cache_creation_1h_tokens` | Anthropic 1 小时 ephemeral cache 写入 |
| `cache_read_tokens`        | Anthropic cache 命中                  |

Token 数据由 `extractNormalizedUsage`（`src/lib/services/proxy-client.ts:468`）从多家协议的 `usage` / `usageMetadata` 字段统一抽取，覆盖 OpenAI / Anthropic / Gemini / OpenAI Responses streaming。

### 路由与决策审计

| 列                       | 说明                                                                 |
| ------------------------ | -------------------------------------------------------------------- |
| `routing_type`           | `direct` / `provider_type` / `tiered`                                |
| `priority_tier`          | 命中上游所在 tier                                                    |
| `failover_attempts`      | 该请求做了几次 failover                                              |
| `failover_history`       | text（JSON array），每次尝试的上游 + 失败原因                        |
| `routing_decision`       | text（JSON object），完整决策上下文                                  |
| `session_id`             | session affinity 提取出的 ID                                         |
| `affinity_hit`           | 是否命中亲和缓存                                                     |
| `affinity_migrated`      | 是否触发亲和迁移                                                     |
| `session_id_compensated` | 是否补偿了 session header                                            |
| `header_diff`            | JSON，记录 inbound / outbound / dropped 的 header 差异               |
| `reasoning_effort`       | 请求推理强度：none / minimal / low / medium / high / xhigh / enabled |
| `thinking_config`        | JSON，请求的推理配置原值                                             |

### 索引（行 336-341）

| 索引                            | 用途                                   |
| ------------------------------- | -------------------------------------- |
| `request_logs_api_key_id_idx`   | 按 key 检索 / 计费配额聚合             |
| `request_logs_upstream_id_idx`  | 按上游检索 / 统计                      |
| `request_logs_created_at_idx`   | 时间窗扫描（list / timeseries 全走它） |
| `request_logs_routing_type_idx` | 按路由类型分组                         |

### 关联：request_billing_snapshots

每条 request_log 有一条对应的 `request_billing_snapshots` 行（1:1，`ON DELETE CASCADE`），存 `finalCost` / `priceSource` / `billingStatus` / `unbillableReason` 等。统计接口的 cost 维度直接 LEFT JOIN 这张表。

## 写入路径

`src/lib/services/request-logger.ts`，**两阶段同步写**，无 sampling / 无截断 / 无 batching：

```
client request
  ↓
proxy route 决策完毕（route.ts:2965）
  ↓
logRequestStart() — INSERT 一行，status_code=NULL，duration_ms=NULL
  ↓
转发到上游 / 接收响应
  ↓
updateRequestLog(id, {...}) — UPDATE，回填 status_code / duration_ms / tokens / errorMessage / failover_history / ttft 等
  ↓
calculateAndPersistRequestBillingSnapshot() — 在 request_billing_snapshots 写计费快照
  ↓
publishRequestLogLiveUpdate() — 广播 SSE 事件给 /api/admin/logs/live 订阅者
```

部分非流式入口直接调 `logRequest()`（`request-logger.ts:504-557`）一次性 INSERT，跳过 in-progress 中间态。

### duration_ms 与 routing_duration_ms 的 clamp

```ts
Math.min(Math.max(0, input.durationMs), INT4_MAX); // INT4_MAX = 2_147_483_647
```

源码见 `request-logger.ts:21,441-448,526-531`。这层保护是 PR #170 / #171 的修复：早期版本 `duration_ms` 没有上界，长时间 stuck 的流式请求写入会超过 PostgreSQL `INT4` 上限直接 INSERT 失败，整条 log 丢失。clamp 之后超时请求虽然 `duration_ms` 失真为 24.8 天封顶，但日志能正常写入。

### Stale reconcile：520 兜底

如果 in-progress 行长时间没被 update 回填（服务重启 / 进程 crash / 异常路径漏写），会留下永远 `status_code IS NULL` 的孤儿行。`request-logger.ts:562-607` 的 `reconcileStaleInProgressRequestLogs` 做兜底：

| 常量                           | 值  | 说明                                        |
| ------------------------------ | --- | ------------------------------------------- |
| `REQUEST_LOG_STALE_MINUTES`    | 15  | 超过 15 分钟仍是 NULL 即视为 stale          |
| `REQUEST_LOG_STALE_SCAN_LIMIT` | 200 | 单次扫描上限，避免一次性处理过多行          |
| stale status code              | 520 | 标记为 HTTP 520 + `errorMessage` 写明超时窗 |

触发时机：每次 `listRequestLogs()` 与各 stats 函数被调用前自动跑（非 test 环境）。失败仅 warn 不中断（`:744-750`）。

读到 `status_code = 520` 不代表上游真返了 520，而是 reconcile 兜底标记，需要人工排查上一次重启 / crash 时是否有未回填的日志。

## 管理 API

### `GET /api/admin/logs` — 分页列表

`src/app/api/admin/logs/route.ts`。Query 参数：

| 参数          | 含义                                          |
| ------------- | --------------------------------------------- |
| `page`        | 页号，默认 1                                  |
| `page_size`   | 每页条数，默认 20，上限 100                   |
| `id`          | 精确匹配 log ID（前端 `focus=<id>` 跳转场景） |
| `api_key_id`  | 精确匹配 Key                                  |
| `upstream_id` | 精确匹配上游                                  |
| `status_code` | 精确匹配整数                                  |
| `start_time`  | ISO datetime，`created_at >=`                 |
| `end_time`    | ISO datetime，`created_at <=`                 |

返回 `{items, total, page, pageSize, totalPages}`，`items` 中每条带完整字段 + billing snapshot。

**注意没有 `model` 过滤参数**——按模型筛要么走 stats leaderboard，要么在客户端做。

### `GET /api/admin/logs/live` — SSE 实时

`src/app/api/admin/logs/live/route.ts`。

- Content-Type `text/event-stream`
- 连接即推 `event: connected`
- 每 15 秒一条 `:keep-alive <ISO>` 注释保活
- 每次日志变更（INSERT / UPDATE）推送 `event: request-log-changed`，payload `{type, logId, statusCode, occurredAt}`

实现是**进程内 in-memory pub/sub**（`src/lib/services/request-log-live-updates.ts:10`）。**多进程部署下不跨实例**——instance A 写的日志，只有连到 instance A 的 SSE 订阅者会收到事件，连到 instance B 的不会。多副本场景下 live 模式实际可用性取决于负载均衡的粘性，详情见 [架构 / 请求生命周期](../architecture/request-lifecycle)。

### `GET /api/admin/stats` — 统一聚合入口

`src/app/api/admin/stats/route.ts`，按 `type` 参数分发到三个子路由：

| `type` 取值        | 行为                                                                      |
| ------------------ | ------------------------------------------------------------------------- |
| `type=overview`    | 当日 + 昨日对比                                                           |
| `type=timeseries`  | `range=today\|7d\|30d&metric=requests\|ttft\|tps\|tokens\|duration\|cost` |
| `type=leaderboard` | `range=today\|7d\|30d&limit=5`（上限 50）                                 |

也可以分别直接调子路由 `/api/admin/stats/overview`、`/api/admin/stats/timeseries`、`/api/admin/stats/leaderboard`。

## 统计聚合

`src/lib/services/stats-service.ts`。**全部实时聚合**——每次 API 调用走一次 SQL，无定时预聚合任务。

### Overview（当日 + 昨日对比）

`getOverviewStats`（`stats-service.ts:265`）。当日与昨日各执行一次聚合查询，LEFT JOIN `request_billing_snapshots`。计算：

| 指标                         | 口径                                                           |
| ---------------------------- | -------------------------------------------------------------- |
| `totalRequests`              | 当日 count(\*)                                                 |
| `avgDuration`                | **仅 2xx** 的 `duration_ms` 平均                               |
| `avgTtft`                    | **仅 2xx** 的 `ttft_ms` 平均                                   |
| `totalTokens`                | 当日 sum(total_tokens)                                         |
| `successCount`               | 当日 count where 2xx                                           |
| `totalCacheReadTokens`       | 当日 sum(cache_read_tokens)                                    |
| `totalEffectivePromptTokens` | 当日 sum(effective prompt，含 cache 抵扣)                      |
| `totalCost`                  | 当日 sum(final_cost) where `billing_status='billed'`           |
| `cacheHitRate`               | `cacheReadTokens / effectivePromptTokens * 100`，clamp [0,100] |

### Timeseries（时间序列）

`getTimeseriesStats`（`stats-service.ts:368`）：

| `range`      | 时间桶粒度                   |
| ------------ | ---------------------------- |
| `today`      | hour                         |
| `7d` / `30d` | day                          |
| `custom`     | 差值 ≤ 2 天 → hour，否则 day |

PG 用 `date_trunc('hour'/'day', created_at)` 分桶（`stats-service.ts:150-158`），并行查 per-upstream + 全量 total 两组。

| `metric`   | 计算口径                                                                             |
| ---------- | ------------------------------------------------------------------------------------ |
| `requests` | count(\*)                                                                            |
| `tokens`   | sum(total_tokens)                                                                    |
| `duration` | avg(duration_ms)                                                                     |
| `ttft`     | avg(ttft_ms)                                                                         |
| `tps`      | tokens / second，**仅** is_stream + 2xx + completion_tokens ≥ 10 + duration_ms > 100 |
| `cost`     | sum(final_cost) where `billing_status='billed'`（需 LEFT JOIN billing_snapshots）    |

TPS 的过滤条件（`stats-service.ts:109-115`）是为了避免短请求 / 非流式 / 已抛错的样本污染分母。

### Leaderboard（排行榜）

`getLeaderboardStats`（`stats-service.ts:525`）。三个维度并行：

| 维度      | 主排序 | 附加分布（top-5，超出归入 "Others"） |
| --------- | ------ | ------------------------------------ |
| API Keys  | top-N  | 每个 key 的 model 分布               |
| Upstreams | top-N  | 直接列出                             |
| Models    | top-N  | 每个 model 的 upstream 分布          |

上游 providerType 通过 `getPrimaryProviderByCapabilities(routeCapabilities)` 推导，因此即使上游没有显式 providerType 字段也能归类。

## 前端：`/logs` 页面与 live 模式

- 页面：`src/app/[locale]/(dashboard)/logs/page.tsx`
- Hook：`src/hooks/use-request-log-live.ts`

Hook 行为：

| 状态         | 含义                                                                              |
| ------------ | --------------------------------------------------------------------------------- |
| `connecting` | SSE 连接建立中                                                                    |
| `live`       | 已收到 `connected` 事件，每次 `request-log-changed` 触发 250ms debounced 列表刷新 |
| `fallback`   | SSE 断开，回落到 3000ms 轮询                                                      |

断线后 10 秒重连一次（`use-request-log-live.ts:23`）。

实际操作建议：

- 排查单条请求 → 列表直接按 `id` 过滤（管理后台支持 focus=&lt;id&gt; 跳转 URL）。
- 排查某个 Key 的最近一批请求 → 列表按 `api_key_id` + 时间窗。
- 排查上游故障期间的失败分布 → list 取数据 + leaderboard 取 top-N 错误来源。

## 保留策略：当前实际情况

::: warning LOG_RETENTION_DAYS 当前没有自动清理任务在跑
`.env` 里的 `LOG_RETENTION_DAYS`（默认 90）被 `config.ts:35,82` 解析存到运行时配置对象，但 **整个 `src` 目录里没有任何代码读取这个配置值去清理 `request_logs` 表**。Background sync 注册表（`src/lib/services/background-sync-registry.ts`）当前只有三个任务：billing price sync、upstream model catalog sync、traffic recording cleanup，**不含 request_log 清理**。

也就是说目前 request_logs 表是**无限增长**的，靠 `LOG_RETENTION_DAYS` 不会让它停下来。需要按日期清理时，目前的手段是：

1. 直接对 DB 执行：`DELETE FROM request_logs WHERE created_at < NOW() - INTERVAL '90 days';`
2. 由于 `request_billing_snapshots` 通过 `ON DELETE CASCADE` 关联，会跟着一起被清。
3. 生产环境建议加入 `LIMIT` 分批 + 索引 `request_logs_created_at_idx` 走顺序扫描，避免一次性锁表。

后续若添加 request_log retention 后台任务，再更新本节。
:::

## 不在本页范围内

- 录制请求 / 响应原始体（fixture）：见 [请求录制](./request-recording)。
- 计费规则、价格来源、unbillable 细化原因：后续「计费」相关文档（仓库内可参考 `billing-cost-service.ts:432-449` 的 `UnbillableReason` 列表）。
- 上游模型与 routing decision 的字段语义：见 [请求生命周期](../architecture/request-lifecycle) 与 [模型路由规则](./model-routing)。
- 部署侧的日志收集 / 监控集成（Prometheus / Grafana 等）：后续部署侧 troubleshooting 章节，目前未覆盖。
