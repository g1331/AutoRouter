---
title: 失败转移与熔断
outline: deep
---

# 失败转移与熔断

AutoRouter 把「上游会失败」当作常态。一次客户端请求可能触发多次转发，前一次失败的上游会被排除、下一次从剩余候选里重新挑；连续多次失败的上游会被熔断器隔离，避免持续把流量打到一个已知坏掉的节点。这一页拆开两个机制：单次请求内的故障转移循环，以及跨请求保持状态的熔断器。

所有引用都指向 `master` 分支源码。上游候选池如何被构建参见 [上游模型](./upstream-model)；这里只关注「选中之后失败该怎么办」。熔断器配置在管理后台的操作面板见 [使用 / 熔断器配置](../usage/circuit-breaker-config)。

## 熔断器状态机

源码：`src/lib/services/circuit-breaker.ts`。三态枚举的字符串值是 `closed` / `open` / `half_open`，每个上游一行 state，持久化在数据库 `circuit_breaker_states` 表（schema 见 [数据库 schema](./database-schema)）。

### 状态转换表

| 当前状态  | 事件                                | 新状态       | 触发条件                              | 源码行                                |
| --------- | ----------------------------------- | ------------ | ------------------------------------- | ------------------------------------- |
| CLOSED    | `recordFailure`                     | OPEN         | `failureCount + 1 ≥ failureThreshold` | `circuit-breaker.ts:249-263`          |
| CLOSED    | `recordFailure`                     | CLOSED       | 未达阈值，仅累加计数                  | `circuit-breaker.ts:277-287`          |
| OPEN      | 下一次请求到来检查 `canRequestPass` | HALF_OPEN    | `now - opened_at ≥ openDuration`      | `circuit-breaker.ts:118-120, 177-179` |
| OPEN      | 下一次请求到来检查 `canRequestPass` | OPEN（拒绝） | 未到 `openDuration`                   | 同上                                  |
| HALF_OPEN | `recordSuccess`                     | CLOSED       | `successCount + 1 ≥ successThreshold` | `circuit-breaker.ts:215-225`          |
| HALF_OPEN | `recordSuccess`                     | HALF_OPEN    | 未达阈值，仅累加成功计数              | `circuit-breaker.ts:226-235`          |
| HALF_OPEN | `recordFailure`                     | OPEN         | 任何一次失败即回滚                    | `circuit-breaker.ts:264-276`          |

::: tip OPEN → HALF_OPEN 是惰性的
没有任何定时器主动把状态翻成 HALF_OPEN。OPEN 状态的过期检查只在「下一次有真实请求到来、需要选这个上游」时由 `acquireCircuitBreakerPermit` 触发（`circuit-breaker.ts:106-124`）。这意味着：若一个 OPEN 上游迟迟没有流量打到它，它会一直保持 OPEN，直到某次请求把它选回候选池，才有机会被翻成 HALF_OPEN 做探测。
:::

### 默认阈值

源码：`src/lib/circuit-breaker-defaults.ts:10-17`。

| 参数                | 默认值     | 含义                            |
| ------------------- | ---------- | ------------------------------- |
| `failureThreshold`  | 5          | CLOSED → OPEN 所需失败次数      |
| `successThreshold`  | 2          | HALF_OPEN → CLOSED 所需成功次数 |
| `openDuration`      | 300 000 ms | OPEN 状态持续时间（5 分钟）     |
| `probeInterval`     | 30 000 ms  | HALF_OPEN 探测最小间隔（30 秒） |
| `firstByteTimeout`  | 30 000 ms  | 上游响应首字节超时              |
| `streamIdleTimeout` | 60 000 ms  | 流式响应空闲超时                |

每个上游可以通过 `circuit_breaker_states.config` JSON 列覆盖以上任意字段（`schema-pg.ts:236-243`），未覆盖项继续走默认。`canRequestPass` 与 `acquireCircuitBreakerPermit` 读出的 `effectiveConfig` 始终是「上游覆盖 ∪ 默认值」的合集。

### recordFailure / recordSuccess

`recordFailure(upstreamId, _errorType?)`（`circuit-breaker.ts:243`）的逻辑：

- CLOSED 且累加后达到阈值 → 写 `state=open, openedAt=now`
- HALF_OPEN → 任意失败回到 OPEN，`successCount` 清零
- 其他情况 → 只 `failureCount += 1`

`recordSuccess(upstreamId)`（`circuit-breaker.ts:208`）只在 HALF_OPEN 状态下生效：

- 累加后达到阈值 → 写 `state=closed, failureCount=0, successCount=0`
- 否则 → 只 `successCount += 1`
- CLOSED 状态下不做任何写入，避免无效写（`circuit-breaker.ts:237-238` 注释明确）

::: warning 没有独立的决策日志表
两个函数都只更新 `circuit_breaker_states` 一张表，不会单独写决策日志。每次失败的证据是写到 `request_logs.failover_history` 这个 JSON 列里（见后文）。
:::

## 单次请求内的故障转移循环

入口函数 `forwardWithFailover`，源码 `src/app/api/proxy/v1/[...path]/route.ts:1289-1753`。签名：

```ts
// route.ts:1289-1313（节选）
async function forwardWithFailover(
  request,
  routeCapability,
  path,
  requestId,
  candidateUpstreamIds: string[],
  requestModel,
  affinityContext,
  compensationHeaders,
  onQueueStateChange?,
  config: FailoverConfig = DEFAULT_FAILOVER_CONFIG
);
```

默认配置在 `src/lib/services/failover-config.ts:44-48`：

```ts
export const DEFAULT_FAILOVER_CONFIG: FailoverConfig = {
  strategy: "exhaust_all", // 耗尽所有候选；另一个选项是 "max_attempts"
  maxAttempts: 10, // 仅 max_attempts 策略下生效
  excludeStatusCodes: [], // 不豁免任何状态码，全部非 2xx 都算失败
};
```

主循环每一轮做三件事：

1. 调用 `selectFromUpstreamCandidates(candidateUpstreamIds, failedUpstreamIds, affinityContext)`，把已经失败的上游排除（`route.ts:1371` 维护 `failedUpstreamIds` 数组）；
2. 调用 `forwardRequest(...)` 实际转发；
3. 根据结果决定下一步：
   - 成功 → `markHealthy` + `recordSuccess` + 返回响应
   - 可故障转移失败 → `markUnhealthy` + `recordFailure`（除非命中 FailureRule）+ 把当前上游加入 `failedUpstreamIds` + 进入下一轮
   - 不可故障转移失败 → 直接把这个错误返回给客户端

### 哪些错误算「可故障转移」

代理层把两类错误判定为可故障转移：

**异常类（`isFailoverableError`，`route.ts:842-863`）**：

- `CircuitBreakerOpenError`
- `FirstByteTimeoutError` / `StreamIdleTimeoutError`
- 错误消息包含 `timed out` / `timeout` / `econnrefused` / `econnreset` / `socket hang up` / `network` / `fetch failed` / `circuit breaker`

**HTTP 响应类（`shouldTriggerFailover`，`failover-config.ts:57-73`）**：

- 状态码非 2xx 且不在 `excludeStatusCodes` 中

默认 `excludeStatusCodes` 为空数组，意味着**所有 4xx（包括 401 / 403 / 404 / 429）都会触发故障转移**。`getErrorType()` 会区分 `http_429` 和通用 `http_4xx`（`route.ts:828-829`），但并不影响是否触发转移。如果不希望客户端的 401 把所有上游试一遍，需要在 `FailoverConfig.excludeStatusCodes` 里配置 `[401, 403]` 等。

### 失败是否记入熔断器：FailureRule

`upstream_failure_rules` 表（`schema-pg.ts:257-272`，详见 [数据库 schema](./database-schema)）允许声明「某些失败不应该让熔断器升温」。规则可以是全局（`upstream_id IS NULL`）也可以是上游局部。匹配字段：

| 字段                           | 含义                                       |
| ------------------------------ | ------------------------------------------ |
| `statusCodes`                  | HTTP 状态码列表                            |
| `errorTypes`                   | 错误类型字符串（如 `stream_idle_timeout`） |
| `bodyPattern`                  | 响应体正则                                 |
| `headerName` + `headerPattern` | 响应头名 + 值正则                          |

源码 `src/lib/services/upstream-failure-rules.ts:8-14`。当 `matchFailureRule()` 命中一条规则时，本次失败仍然会触发故障转移，但 `circuitBreakerRecorded = false`（`route.ts:1549-1556, 1707-1710`），不写入 `circuit_breaker_states.failure_count`。

典型用法：上游对应 OAuth 受控的 CLIProxyAPI auth-file，正常会偶发 401 触发后台 refresh，不希望把上游打到熔断；可以加一条 `statusCodes: [401], bodyPattern: "token expired"` 的规则。上游层 `upstreams.failure_rule_config.useGlobalRules`（默认 `true`）控制是否同时参与全局规则匹配（`upstream-failure-rules.ts:318-326`）。

### 并发已满与队列等待

当 `selectFromUpstreamCandidates` 抛出 `AllCandidatesConcurrencyFullError` 并携带 `waitableCandidate` 时，主循环不会立即返回失败，而是调用 `resumeQueuedUpstreamSelection`（`route.ts:1403-1463`），内部通过 `upstreamQueueAdmission` 等待该上游的并发槽位释放。等待时长由 `upstream.queue_policy` 控制，超时会抛 `UpstreamQueueWaitTimeoutError`，此时不再尝试其他上游，直接返回 503 / 504。

### 故障转移决策日志

每次请求结束时会更新 `request_logs` 表（`schema-pg.ts:279-342`），与故障转移相关的列：

| 列                  | 含义                                                                                                                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `failover_attempts` | 总尝试次数（含第一次）                                                                                                                                                                                                                                      |
| `failover_history`  | `FailoverAttempt[]` 的 JSON 序列化：每条含 `upstream_id`、`upstream_name`、`error_type`、`error_message`、`status_code`、`response_headers`、`response_body_text`、`response_body_json`、`attempted_at`、`circuit_breaker_recorded`、`matched_failure_rule` |
| `routing_decision`  | `RoutingDecisionLog`：含 `selected_upstream_id`、`actual_upstream_id`、`candidates[]`（每条含 `circuit_state`）、`excluded[]`、`failure_stage`、`final_selection_reason`                                                                                    |
| `upstream_id`       | 最终成功的上游 ID；全部失败时为 `null`                                                                                                                                                                                                                      |

这是排查「某次客户端请求为什么用了 8 秒、试了 4 个上游」的唯一可靠数据源。前端日志详情页和 `/api/admin/logs/[id]` 都会解析这两个字段。日志读写细节见 [使用 / 请求日志与统计](../usage/logs-stats)。

## 健康检查与后台任务

`src/lib/services/health-checker.ts` 提供 `checkUpstreamHealth(upstreamId)`、`probeUpstream(upstreamId)`、`markHealthy`、`markUnhealthy` 四个函数。前两个用于主动探测，后两个由代理层在请求成功 / 失败时被动调用。

但要注意：**当前项目没有定时器在后台自动探测熔断器**。`src/lib/services/background-sync-registry.ts` 注册的后台任务只有三个：

| 后台任务                                       | 用途             |
| ---------------------------------------------- | ---------------- |
| `createBillingPriceCatalogSyncTaskDefinition`  | 同步模型价格目录 |
| `createUpstreamModelCatalogSyncTaskDefinition` | 同步上游模型列表 |
| `createTrafficRecordingCleanupTaskDefinition`  | 清理过期录制文件 |

这四个函数里，**真正会写 `upstream_health` 表的只有 `checkUpstreamHealth`**：它在 `health-checker.ts:310` 调用 `updateHealthStatus`，后者执行 `db.update(upstreamHealth)` / `db.insert(upstreamHealth)`（`health-checker.ts:192, 206`）。`probeUpstream`（`health-checker.ts:546`）则只调用 `testUpstreamConnection` 做连通测试并返回 `boolean`，**不写任何表**，且 grep 全仓库 `probeUpstream(` 没有任何调用点（dead export）。

任何一种情况下，主动探测都不会改变熔断器状态。要把一个 OPEN 上游放回 CLOSED，要么等真实流量打到它触发 HALF_OPEN，要么使用下文的强制操作。

## Admin 强制控制

源码：`src/app/api/admin/circuit-breakers/`。

| 端点                                                | 行为                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/admin/circuit-breakers`                   | 分页列出所有上游熔断器状态，支持 `?state=` 过滤（`route.ts:80`） |
| `GET /api/admin/circuit-breakers/[id]`              | 查询单个上游（`[id]/route.ts:18`）                               |
| `POST /api/admin/circuit-breakers/[id]/force-open`  | 调 `forceOpen(upstreamId)`（`force-open/route.ts:37`）           |
| `POST /api/admin/circuit-breakers/[id]/force-close` | 调 `forceClose(upstreamId)`（`force-close/route.ts:37`）         |

`forceOpen(upstreamId)`（`circuit-breaker.ts:293-304`）写 `state=open, openedAt=now`，**不清零** `failureCount`。`forceClose(upstreamId)`（`circuit-breaker.ts:309-320`）写 `state=closed, failureCount=0, successCount=0`，等价于「恢复出厂」。

::: warning 强制操作不写审计日志
两个端点只验证 `Authorization: Bearer <ADMIN_TOKEN>`，操作本身不写任何审计记录，也不记录是谁触发的。如果需要可追溯的强制操作，建议在 Nginx / 反向代理层加访问日志，并约束 `ADMIN_TOKEN` 的分发范围。
:::

## 推荐排查流程

某个上游被频繁熔断时，按以下顺序排查：

1. 在管理后台「请求日志」筛该上游近 1 小时的失败请求，查看 `failover_history[*].error_type` 的分布——是网络层（`timeout` / `econnrefused`）还是协议层（`http_4xx` / `http_5xx`）。
2. 查 `request_logs.failover_history[*].matched_failure_rule`，确认是否有 `circuit_breaker_recorded: false` 的失败（说明 FailureRule 在工作，熔断不是这些失败导致的）。
3. 在「熔断器」面板查该上游的 `failureCount` 累积速度。若每分钟超过 `failureThreshold`（默认 5）次，结合上一步定位最常见错误，要么修上游、要么加一条 FailureRule 屏蔽不该计入的失败、要么调大 `failureThreshold`。
4. 临时排障期间，用 `force-open` 把上游隔离，避免新流量继续打过去；问题排清后用 `force-close` 立刻恢复，不必等 5 分钟 `openDuration`。
