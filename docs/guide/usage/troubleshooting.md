---
title: 故障排查手册
outline: deep
---

# 故障排查手册

本手册按「客户端可见症状 → 错误码 / 字段 → 根因 → 排查路径」组织，覆盖部署成功后**运行期**会遇到的常见问题：客户端 Key、路由 / 候选上游、流式中断、CLIProxyAPI、计费、日志兜底。每条尽可能给出源码位置以便深入。

部署期问题（容器起不来、healthcheck 失败、`ENCRYPTION_KEY` 丢失等）在 [部署侧排查](../deployment/troubleshooting) 中处理，本页不重复。熔断状态机的细节排查在 [现有长篇 `docs/circuit-breaker.md`](/circuit-breaker) 的 Troubleshooting 一节，本页只列**用户可见的入口**。

## 一、客户端 Key 相关

| 客户端看到的响应                                                                     | 触发位置                                              | 根因 / 排查方向                                                                                                                                     |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401 {"error":"Missing API key"}`                                                    | `route.ts:2446-2449`                                  | 三个 header（`Authorization` / `x-api-key` / `x-goog-api-key`）都没值。检查客户端 SDK 是否真的把 Key 注入到请求                                     |
| `401 {"error":"Invalid API key"}`                                                    | `route.ts:2454-2473`                                  | 按 keyPrefix 找不到激活 key，或 hash 校验失败。先在管理后台用前缀搜确认 key 存在且 active                                                           |
| `401 {"error":"API key has expired"}`                                                | `route.ts:2463-2465`                                  | `candidate.expiresAt < new Date()`。如要延期，到管理后台改 `expires_at`                                                                             |
| `403 {error:{code:"API_KEY_MODEL_NOT_ALLOWED", ...}}`                                | `route.ts:2507-2542`                                  | Key 的 `allowedModels` 列表不含请求模型。要么把模型加进 allowedModels，要么换 Key                                                                   |
| `403 {error:{code:"NO_AUTHORIZED_UPSTREAMS"}}`                                       | `route.ts:2726-2745`、`load-balancer.ts:39-44`        | Restricted 模式 Key 未绑定任何能匹配的上游，或绑定上游全被 model rule 排除。检查 Key→Upstream 绑定与上游 model_rules                                |
| `429 {error:{code:"API_KEY_QUOTA_EXCEEDED", user_hint:"当前密钥已达到消费限额..."}}` | `route.ts:163-280`、`api-key-quota-tracker.ts:62-133` | Key 已超 spending quota；仅 streaming + 可定价模型触发主动拒绝。In-memory tracker 同步周期：80% 以下 5 min，80%+ 紧急 1 min。涨额度后等下次同步生效 |

排查 Key 维度问题，最快路径是 `/logs?api_key_id=<id>` 看最近一批请求的 status_code 与 `error_message`。

## 二、路由 / 候选上游

| 响应                                                                             | 触发位置                                 | 根因 / 排查方向                                                                                                   |
| -------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `503 {error:{code:"NO_UPSTREAMS_CONFIGURED"}}`（reason：路径不支持）             | `route.ts:2547-2625`                     | `resolveRouteCapability` 返回 null。请求 method+path 不在已知 capability 列表里                                   |
| `503 {error:{code:"NO_UPSTREAMS_CONFIGURED"}}`（reason：池为空）                 | `route.ts:2703-2724`                     | 活跃上游中没有一条声明匹配的 `route_capabilities`。检查上游列表 + `is_active`                                     |
| `503 {error:{code:"NO_UPSTREAMS_CONFIGURED", reason:"NO_HEALTHY_CANDIDATES"}}`   | `route.ts:2749-2813`、`route.ts:591-624` | Key 绑定上游或 capability 池在 model rule 过滤后为空。检查 `model_rules` 与拼写                                   |
| `503 {error:{code:"ALL_UPSTREAMS_UNAVAILABLE", reason:"NO_HEALTHY_CANDIDATES"}}` | `load-balancer.ts:1141-1144`、`:243-303` | 所有 tier 遍历完毕：上游或熔断 OPEN 未到期，或 quota 耗尽。看每个上游的 circuit_breaker_states 与上游绑定的 quota |
| `503 {error:{code:"ALL_UPSTREAMS_UNAVAILABLE", reason:"CONCURRENCY_FULL"}}`      | `load-balancer.ts:49-62, 1129-1144`      | `max_concurrency` 全打满且未启用队列                                                                              |
| `504 {error:{code:"QUEUE_WAIT_TIMEOUT"}}`                                        | `upstream-queue-admission.ts:89-118`     | 进入队列但 `timeout_ms` 内未拿到槽位                                                                              |
| `499 {error:{code:"CLIENT_DISCONNECTED"}}`                                       | `upstream-queue-admission.ts:89-118`     | 客户端在排队期间断开了连接                                                                                        |
| `503 {error:{code:"QUEUE_FULL", reason:"queue_full"}}`                           | `upstream-queue-admission.ts:189-197`    | 队列已达 `max_queue_length`，直接拒绝                                                                             |

### HALF_OPEN 探针失败循环（症状不直接报错，但成功率低）

熔断 `HALF_OPEN` 时按 `probeInterval` 间隔放一条探针请求，失败立即回 OPEN（`load-balancer.ts:282-296`）。表现为：

- 客户端偶发收到 5xx / 超时，成功率波动。
- `request_logs.failover_history` 里能看到对该上游的尝试 → 失败 → 跳到下一个。
- 上游的 `circuit_breaker_states` 在 OPEN 与 HALF_OPEN 间反复切。

排查：先看该上游的实际健康状态（直接对它发一个最小测试请求），不是熔断的锅而是上游本身在恢复。详细的熔断状态机参考 [现有长篇 `docs/circuit-breaker.md`](/circuit-breaker) 的 Troubleshooting 节。

### `routing_decision` 字段拿不准

每条 `request_logs` 都有一个 `routing_decision`（JSON），完整记录了候选池、被过滤的原因、最终选择。排查路由层问题时优先看它，而不是凭推测。字段语义在 [请求生命周期](../architecture/request-lifecycle) 里展开。

## 三、流式 / SSE 中断

| 客户端看到                                                           | 错误码                        | 根因                                                                                                                                                      |
| -------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 流途中收到 `event: error` 后断流，data 含 `"code":"REQUEST_TIMEOUT"` | `REQUEST_TIMEOUT`（HTTP 504） | `streamIdleTimeout` 内未收到新数据块。`route.ts:2082-2084`、`proxy-client.ts` 的 `StreamIdleTimeoutError`                                                 |
| 流途中收到 `event: error`，data 含 `"code":"STREAM_ERROR"`           | `STREAM_ERROR`（HTTP 502）    | 流中其他读取异常（连接重置 / 协议错误等）                                                                                                                 |
| 流开始前失败                                                         | 走普通 5xx                    | 还能 failover，参见上一节                                                                                                                                 |
| 流开始**后**中断                                                     | 仅 SSE error event            | **不可重试**——AutoRouter 不会做 mid-stream failover，因为已经向客户端发送了头与部分 body。详见 [请求生命周期](../architecture/request-lifecycle) 第六阶段 |

`is_stream=true` 的请求一旦写出第一个字节，AutoRouter 失去重试机会；这是协议层面的硬约束，不是 bug。如果客户端要在中断时换上游，需要客户端自己负责重新建连。

## 四、CLIProxyAPI 相关

四态判定（`cliproxy-connection-tester.ts:83-123`，详见 [CLIProxyAPI 首次使用指南](./cliproxy-first-time)）：

| 状态            | 触发                          | 客户端可见                                             | 排查方向                                                               |
| --------------- | ----------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `unreachable`   | 10 秒超时、DNS 失败、拒绝连接 | 上游同步失败、账号列表为空；调用走 failover 或全部熔断 | sidecar 服务名拼错、CPA 容器未起、网络不通                             |
| `auth_failed`   | HTTP 401 / 403                | 管理 API 操作全部失败                                  | `management_key` 与 CPA 容器 env 中的 `CLIPROXY_MANAGEMENT_KEY` 不一致 |
| `service_error` | 其他非 2xx                    | 同上                                                   | 看 CPA 容器日志，可能是 CPA 内部异常                                   |
| `success`       | 2xx                           | 正常                                                   | —                                                                      |

### OAuth 账号失效

`cliproxy_auth_accounts` 表的字段：

| 字段                      | 含义                                           |
| ------------------------- | ---------------------------------------------- |
| `disabled`                | 账号被显式 disable（管理后台启停按钮触发）     |
| `rawMetadata.unavailable` | CPA 侧自己标记为不可用                         |
| `modelCount`              | 同步时拉到的模型数；查询失败时回落到上次值或 0 |

判定（`cliproxy-auth-account-service.ts:29, 149-156`）：disabled / unavailable 的账号，CPA 拒绝转发，AutoRouter 看到失败后 failover 到下一条池上游。

排查：管理后台 **CLIProxyAPI 实例 → 账号列表** 查 disabled / unavailable / modelCount=0 的账号，必要时重新走一次 OAuth 登录刷新。

### 删除 CLIProxy 实例时报「仍在使用」

`409 CliproxyInstanceInUseError` —— 实例下仍有引用未清理。删除顺序与原因见 [CLIProxyAPI 外部 vs sidecar 选择](./cliproxy-modes) 的「删除实例的影响」一节。

### CPA 出站代理改了不生效

`CLIPROXY_PROXY_URL` 是容器启动期 env 注入，`docker compose restart` 不会重读 `.env`。要重建容器，详见 [CLIProxyAPI 出站代理配置](./cliproxy-egress-proxy)。

## 五、计费相关

### FK 违例自动重试

写 `request_billing_snapshots` 时 PG 抛 `23503` 外键违例（API key 或 upstream 在 snapshot 写入与请求处理之间被并发删除），`billing-cost-service.ts:109-144` 会把违反的 `api_key_id` 或 `upstream_id` 置 NULL 后重试，**最终行能写进去**。

判定逻辑（PR #170 / #172 / #173 三次叠加）：同时检查顶层 `.code` 与 `.cause.code`，以及 error message 文本——同一类问题不同库版本错误结构不一样。

如果日志里大量出现 `billing snapshot FK violation retried with NULL` warning，说明有 key 或上游在被频繁删除，应该查删除来源（人工删 / 脚本 / 测试串到生产？）。

### duration_ms 显示约 24.8 天

`Math.min(Math.max(0, durationMs), INT4_MAX)` 的 clamp 上限是 2,147,483,647 ms ≈ 24.8 天（`request-logger.ts:21,411-417`）。读到这个值通常意味着原始 duration 异常大或溢出过 INT4，clamp 之后才能写库，**不是真的跑了 24.8 天**。配合 status_code 一起看，多半是 520（见下）或上游长时间 stuck。

### `status_code = 520`：stale 兜底

`reconcileStaleInProgressRequestLogs`（`request-logger.ts:524-569`）把 15 分钟内仍是 `status_code IS NULL` 的非流式行标记为 520，`errorMessage = "Request did not settle before the stale reconciliation timeout window"`。

读到 520 **不是上游真的返了 520**，而是 reconcile 兜底。排查：

1. 看这批 520 集中在哪个时间点 → 大概率是上一次服务重启 / crash。
2. 看具体行的 `upstream_id` → 是否有特定上游在那段时间长时间无响应。
3. 如果 520 持续出现，说明有代码路径漏写 update（应该是 bug，去 grep `logRequestStart` 但没有对应 `updateRequestLog` 的分支）。

### 计费快照标记 unbilled

`billing-cost-service.ts:432-449` 的 `UnbillableReason`：

| reason              | 含义                                                |
| ------------------- | --------------------------------------------------- |
| `model_missing`     | `model` 字段为空                                    |
| `usage_missing`     | prompt / completion / total 三个 token 都为 0       |
| `price_not_found`   | 模型在 manual / openrouter / litellm 价表中都没命中 |
| `calculation_error` | 算价过程异常                                        |

`price_not_found` 是最常见的——新模型 / 自定义模型需要在管理后台「定价管理」补一条 manual 价格，或等价表 sync。

## 六、日志加载相关

| 症状                                       | 根因 / 排查                                                                                                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/logs` 列表偶发卡顿，第一页 1-2 秒才出    | `listRequestLogs` 调用前会先跑一次 `reconcileStaleInProgressRequestLogs`（`request-logger.ts:706-710`），若上次 stale 行较多会拖慢首响应。失败仅 warn，不影响列表本身 |
| Live 模式连不上 / 一直 `fallback`          | `/api/admin/logs/live` SSE 是进程内 pub/sub，**多副本部署**下不跨实例。检查 LB 是否启用了粘性会话；本机直连测试 SSE 端点                                              |
| 列表里出现一批 520 + duration_ms ≈ 24.8 天 | 见上一节「status_code = 520」                                                                                                                                         |
| 列表过滤参数说不支持 model                 | `/api/admin/logs` 的 query 参数确实没有 `model`（`route.ts`）。按模型查只能走 leaderboard 或客户端                                                                    |

## 七、什么时候开请求录制

录制是事后排查最有力的工具，但默认关。开启场景：

- 复现某次只发生在生产的失败：临时 `mode = failure`（默认就是），等待发生后取 fixture 在 dev 用 `/api/mock` 回放。
- 调试新接入的客户端协议层 / 上游变体：`mode = all` 短时间打开，定向触发若干请求，**结束后立即切回 failure**——`all` 模式磁盘占用涨得很快。

完整设置见 [请求录制](./request-recording)。

## 八、什么时候要看 `routing_decision` / `failover_history`

| 场景                                   | 优先看                                              |
| -------------------------------------- | --------------------------------------------------- |
| 客户端报 5xx，想知道是哪条上游挂了     | `failover_history`                                  |
| 客户端报「为什么没选我希望的那条上游」 | `routing_decision`（候选池 / 过滤原因 / 选中原因）  |
| Session affinity 没生效                | `session_id` / `affinity_hit` / `affinity_migrated` |
| 想知道某次请求做了几次 failover        | `failover_attempts`                                 |

字段位置见 [请求日志与统计](./logs-stats)。

## 不在本页范围内

- 部署期问题（容器无法启动、healthcheck 失败、`ENCRYPTION_KEY` 丢失、数据库连接失败）：见 [部署侧排查](../deployment/troubleshooting)。
- 熔断状态机细节、failover 不工作、failover 高延迟：见 [现有长篇 `docs/circuit-breaker.md`](/circuit-breaker) 的 Troubleshooting 节。
- CLIProxyAPI 部署侧问题（sidecar 起不来、CPA 自身配置）：见 [现有长篇 `docs/cliproxy-deployment.md`](/cliproxy-deployment) 与 [CI 部署后追加 CLIProxyAPI sidecar](../deployment/cliproxy-sidecar)。
