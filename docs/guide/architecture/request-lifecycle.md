---
title: 请求生命周期
outline: deep
---

# 请求生命周期

这一页跟踪一次客户端请求从进入 AutoRouter、完成鉴权与上游准入、发送到上游，再到响应、日志、计费和流量录制落地的完整流程。代理请求由多个边界清晰的模块协作：`route.ts` 只负责 HTTP 方法与参数适配，`proxy-request-lifecycle.ts` 的 `executeProxyRequest` 负责生命周期编排，`proxy-execution.ts` 的 `forwardWithFailover` 负责候选选择、队列准入、上游调用与失败转移，`proxy-non-stream-lifecycle.ts` / `proxy-stream-lifecycle.ts` 负责终态响应和日志、计费、录制收口。

示例以最常见的 `POST /api/proxy/v1/chat/completions` 为基准，其他协议（Anthropic `/v1/messages`、Gemini `/v1beta/models/<model>:generateContent`、OpenAI `/v1/responses` 等）的差异在相应阶段标出。

## 阶段一：HTTP 方法分发

入口文件：`src/app/api/proxy/v1/[...path]/route.ts`。

文件导出 `GET`、`POST`、`PUT`、`DELETE`、`PATCH` 五个 HTTP 方法。每个方法只把请求和动态路径参数委托给同一个生命周期入口：

```ts
export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return executeProxyRequest(request, path.join("/"));
}
```

`route.ts` 不再直接编排鉴权、路由、上游调用、日志、计费或 recording。阅读代理行为时，以 `proxy-request-lifecycle.ts` 的 `executeProxyRequest` 为主时序，以 `proxy-execution.ts` 的 `forwardWithFailover` 为上游执行子流程，并在 `proxy-non-stream-lifecycle.ts` 与 `proxy-stream-lifecycle.ts` 查看终态副作用。

## 阶段二：CORS 与 OPTIONS

代理入口没有显式导出 `OPTIONS` handler，也没有独立的 `cors.ts` 工具文件。环境变量 `CORS_ORIGINS` 会在 `src/lib/utils/config.ts` 中解析，但当前没有代码据此输出 `Access-Control-Allow-*` 响应头，因此把 origin 加入该列表不会改变代理的浏览器 preflight 行为。浏览器侧 SDK 如需直连，应在代理前置一层 Nginx、Caddy 或 Traefik，由前置层处理 CORS。

## 阶段三：客户端鉴权

客户端 Key 提取函数是 `proxy-request-lifecycle.ts` 的 `extractProxyApiKey`。三个 header 按以下顺序判定，先命中先用：

1. `Authorization`：兼容 `Bearer <key>` 与裸字符串。
2. `x-api-key`：Anthropic SDK 的默认 header。
3. `x-goog-api-key`：Gemini SDK 的默认 header。

提取后，`executeProxyRequest` 按 key prefix 找候选记录并用 `verifyApiKey` 做 bcrypt 比对，再检查过期与用户状态。

| 场景                     | HTTP 响应                                | 说明                         |
| ------------------------ | ---------------------------------------- | ---------------------------- |
| 缺少支持的 Key header    | 401 `{ "error": "Missing API key" }`     | 不进入上游路由               |
| Key 不存在或 hash 不匹配 | 401 `{ "error": "Invalid API key" }`     | 不进入上游路由               |
| Key 已过期               | 401 `{ "error": "API key has expired" }` | 不进入上游路由               |
| Key 所有者已停用         | 401 `{ "error": "API key is disabled" }` | ownerless key 不受此检查影响 |

这些早期鉴权错误保留简单的顶层 `error` 字符串格式，并通过 `logRejectedRequest` 写入拒绝日志；它们不产生上游请求、计费快照或 traffic fixture。

### 重复鉴权校验的性能边界

`verifyApiKey` 对成功的 bcrypt 比对使用进程内短 TTL 缓存（当前 TTL 为 10 秒、最多保留 2048 条），缓存键由 API Key 的 SHA-256 摘要与当前 bcrypt hash 组成，不保存 API Key 明文。首次请求或缓存失效时仍执行完整 bcrypt 比对。

该缓存不改变撤销和准入语义：代理每次请求仍先从数据库读取 `is_active` 的 Key 记录，并在缓存命中后继续检查过期时间、用户状态、模型权限、上游授权与速率 / 消费规则。停用或删除 Key 后，后续请求不会因为缓存命中而继续通过。缓存是单进程的，多实例之间不共享。

## 阶段四：路由能力、模型与 API Key 准入

鉴权通过后，`extractRequestContext` 从请求体和路径提取模型、session ID、stream 标志、reasoning effort 与 service tier。`resolveRouteCapability` 将 method、path 和 client profile 映射为 `RouteCapability`。

模型来源按协议不同：

- OpenAI / Anthropic：`bodyJson.model`。
- Gemini：`extractGeminiModelFromPath(path)` 从 URL 中提取模型。
- 最终模型：请求体模型优先，否则使用路径模型。

没有模型时 AutoRouter 不会凭空拒绝请求；如果上游返回 400，该错误来自上游，而不是网关的统一错误层。

在读取上游候选前，生命周期模块还会处理 API Key 维度的准入：

- `API_KEY_RATE_LIMITED`：Key 的 RPM / TPM 限制已达到，返回 429，并带 `Retry-After`。
- `API_KEY_QUOTA_EXCEEDED`：消费规则已超过额度，返回 429。
- `API_KEY_MODEL_NOT_ALLOWED`：Key 不允许请求该模型，返回 403。

这些拒绝都设置 `did_send_upstream: false`，并记录 `failure_stage: "auth_filter"` 或对应的准入阶段。

## 阶段五：候选过滤与上游选路

`executeProxyRequest` 先读取活跃上游快照，再根据 Key 的 `accessMode` 构建候选集合：

- `restricted`：只允许 `apiKeyUpstreams` 关联表中的上游。
- `unrestricted`：允许所有活跃上游，但仍受 capability、model rule、健康和熔断状态限制。

候选集合随后经过：

1. `filterCandidatesByModelRules`：按上游 `model_rules` 过滤模型。
2. `filterByCircuitBreaker`：跳过 `OPEN` 或尚未到探测时间的 `HALF_OPEN` 上游。
3. `selectFromUpstreamCandidates`：按 tier、权重、健康和 session affinity 选择候选。
4. 转发前再次申请熔断器准入；期间变为 `OPEN` 的候选会被拒绝或触发失败转移。

路径 capability 候选筛选只执行成员判断，并保留 `codex_responses` 等 legacy capability 映射；不会为每个候选重复构造完整 capability 列表。模型规则在单次候选判断中只归一化一次，已归一化规则由路由与模型目录读取路径直接复用。

如果路径不支持 capability、Key 没有授权上游或候选集合为空，请求在发送上游前结束。常见统一错误会包含 `request_id`、`reason`、`did_send_upstream` 和用户可读的 `user_hint`。

## 阶段六：上游调用前的拒绝与资源释放

这是代理生命周期的关键边界：只有 `forwardRequest` 真正开始调用上游后，才把请求视为已发送。所有此前的失败都必须满足：

- 不发送上游请求。
- 不写入成功计费快照。
- 不写入 traffic recording fixture。
- 写入正确的拒绝阶段、原因、耗时与队列状态。

### 常见拒绝结果

| 阶段 / 原因                      | HTTP 响应                      | `did_send_upstream` |
| -------------------------------- | ------------------------------ | ------------------- |
| 无匹配 capability 或无可用候选   | 503                            | `false`             |
| Key 未授权任何可用上游           | 403 `NO_AUTHORIZED_UPSTREAMS`  | `false`             |
| 所有候选并发已满且未进入队列     | 503，reason `CONCURRENCY_FULL` | `false`             |
| 等待队列超时                     | 504 `QUEUE_WAIT_TIMEOUT`       | `false`             |
| 队列已满                         | 503，队列拒绝                  | `false`             |
| 客户端在 dispatch 前取消         | 499 `CLIENT_DISCONNECTED`      | `false`             |
| 读取请求体或 dispatch 前准备失败 | 503                            | `false`             |

### 队列与并发生命周期

`upstream-queue-admission.ts` 的 `UpstreamQueueAdmissionService` 管理每个上游的 active reservation 与等待队列：

1. `enqueueWait` 创建等待项，并注册 timeout 和 abort listener。
2. 等待成功后，释放的并发槽位通过 reservation handoff 交给排队请求，状态变为 `resumed`。
3. 超时或客户端取消时，服务移除等待项，清理 timer 与 abort listener，并分别产生 `timed_out` 或 `aborted` 状态。
4. dispatch 前的取消、重新选路失败和准备阶段异常通过 `releaseConnection` 释放已获得的槽位。
5. `createReleaseConnectionOnce` 保证同一个上游 reservation 不会被重复释放。

请求日志的 `routing_decision.queue` 会记录 `waiting`、`resumed`、`timed_out` 或 `aborted`，便于区分“没有容量”和“请求主动取消”。

### 取消语义

`request.signal` 从入口一路传给 `forwardWithFailover` 和上游 `fetch`：

- dispatch 前取消：停止选路 / 排队，不调用上游，返回 499，并释放相关 reservation。
- dispatch 后取消：取消上游 fetch，释放当前连接并结束本次请求；不会把已经向客户端发送过响应头或 body 的流切换到另一条上游。

## 阶段七：上游转发与失败转移

`proxy-execution.ts` 的 `forwardWithFailover` 调用 `proxy-client.ts` 的 `forwardRequest`。转发过程包括：

1. `filterHeaders` 移除 hop-by-hop 请求头。
2. `injectAuthHeader` 按上游 provider 注入 `Authorization`、`x-api-key` 或 `x-goog-api-key`。
3. `fetch` 使用下游 `AbortSignal` 发起上游请求。
4. 非流式响应整体返回；SSE 响应经过 transformer 和流式 tracking 后返回。

首字节前的 5xx、连接错误和可配置失败规则可以触发 failover：当前上游会记录 `failoverHistory`、更新健康 / 熔断状态、释放 reservation，再回到阶段五选择下一条候选。

流已经开始后不再 failover。中途读取失败只更新日志、记录熔断失败并释放连接，客户端需要自行重新建立请求。

请求体读取失败或 fetch 尚未真正开始时，`proxy-client.ts` 会通过 request metadata 标记 `fetchStarted: false`。生命周期模块据此把错误归类为 gateway rejection，而不是上游失败，不会误标记上游 unhealthy。

## 阶段八：日志、计费、录制与响应回写

### 请求日志

- 在候选集合准备完成后，`logRequestStart` 创建 `in-progress` 日志，供管理后台实时展示。
- 早于该节点发生的鉴权、Key 准入和 capability 拒绝，直接通过 `logRejectedRequest` 写入终态日志。
- 后续失败或成功通过 `updateRequestLog` 更新同一行；没有可用的起始日志时，使用 `logRequest` 兜底插入。
- 日志中的 `routing_decision` 会记录候选、排除原因、`failure_stage`、`actual_upstream_id`、`did_send_upstream` 和队列状态。

### 计费与流量录制

计费入口是 `billing-cost-service.ts` 的 `calculateAndPersistRequestBillingSnapshot`，以 request log ID 做幂等 upsert。录制入口是 `traffic-recorder.ts` 的 `recordTrafficFixture`。

两者的生命周期边界不同：

- `did_send_upstream === false`：不写计费快照，不构建或写入成功 / 失败 fixture。
- `did_send_upstream === true`：成功请求按正常路径计费并按设置录制；已发送上游但最终失败的请求可以写失败计费快照和 failure fixture，用于真实故障排查。

### 响应格式

路由阶段及之后的错误由 `src/lib/services/unified-error.ts` 统一映射为 `{ error: { code, message, ... } }`。鉴权早期错误保留阶段三的简单 `{ error: string }` 兼容格式。非流式成功响应返回上游 body；SSE 响应额外设置 `Content-Type: text/event-stream`、`Cache-Control: no-cache` 与 `Connection: keep-alive`。

## 时序总览

```
客户端
  │   POST /api/proxy/v1/chat/completions
  ▼
[1] route.ts 方法适配
  ▼
[2] CORS / OPTIONS（当前没有自定义 preflight handler）
  ▼
[3] executeProxyRequest 鉴权
      ├ 缺失 / 无效 / 过期 / disabled key → 401
      └ 记录拒绝日志，不访问上游
  ▼
[4] capability + model + Key 准入
      ├ rate limit / quota / model permission → 429 / 403
      └ did_send_upstream = false
  ▼
[5] 候选过滤 + 熔断 + 并发选路
      ├ 无候选 / 未授权 / 并发满 → 403 / 503
      └ queue admission → waiting / resumed / timed_out / aborted
  ▼
[6] 上游调用前拒绝与资源释放
      ├ queue / reservation / abort listener cleanup
      └ 不计费、不录制、不发送上游
  ▼
[7] forwardWithFailover → proxy-client.forwardRequest
      ├ 成功 → 非流式响应或 SSE
      └ 首字节前失败 → 记录 failoverHistory 后回到 [5]
  ▼
[8] request log / billing / recording / response
  ▼
客户端 ← 2xx 响应体、SSE 或统一错误响应
```

## 不在本页范围内

- 客户端 Key 的创建与可见性配置：见 [创建客户端 API Key](../usage/client-keys)。
- 上游配置字段与 capability 声明：见 [添加第一个上游](../usage/first-upstream)。
- 各类 SDK 调用样例：见 [通过 AutoRouter 调用模型](../usage/invoke-models)。
- 熔断器与失败转移的状态机细节：见 [`docs/circuit-breaker.md`](/circuit-breaker)。
- 请求日志筛选与统计查询：见 [请求日志与统计](../usage/logs-stats)。
