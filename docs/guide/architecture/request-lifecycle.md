---
title: 请求生命周期
outline: deep
---

# 请求生命周期

这一页跟踪一次客户端请求从打到 AutoRouter 入口、到上游响应回到调用方手中的完整流程。所有引用都指向 `master` 分支上的源码与行号，可以照着读、照着改。示例以最常见的 `POST /api/proxy/v1/chat/completions` 为基准，其他协议（Anthropic `/v1/messages`、Gemini `/v1beta/models/<model>:generateContent`、OpenAI `/v1/responses` 等）的差异在每一阶段单独标出。

## 阶段一：HTTP 方法分发

入口文件：`src/app/api/proxy/v1/[...path]/route.ts`。

文件末尾导出全部 5 个 HTTP 方法，每个方法只做一件事——把请求委托给同一个内部函数 `handleProxy`：

| 导出     | 行号 |
| -------- | ---- |
| `GET`    | 4134 |
| `POST`   | 4141 |
| `PUT`    | 4148 |
| `DELETE` | 4155 |
| `PATCH`  | 4162 |

```ts
// route.ts:4141
export async function POST(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}
```

`handleProxy` 自身从 `route.ts:2434` 开始，是后续所有阶段的容器函数。阅读源码时把它当成「主时序图」即可。

## 阶段二：CORS 与 OPTIONS

代理入口**没有**显式导出 `OPTIONS` handler，也没有独立的 `cors.ts` 工具文件。环境变量 `CORS_ORIGINS` 解析后保存在 `src/lib/utils/config.ts` 的 `corsOrigins` 字段中（默认 `["http://localhost:3000"]`），但当前**仅此一处引用**——全仓没有任何代码读取该字段后输出 `Access-Control-Allow-Origin` 或允许请求头等响应头（grep `Access-Control-Allow` 无匹配）。也就是说：`CORS_ORIGINS` 在当前实现里没有运行期效果，把某个 origin 加入该列表并不能让代理通过浏览器的 preflight。如果一定要让浏览器侧 SDK 直连代理，需要在代理前置一层反向代理（Nginx / Caddy / Traefik 等）由它来注入 CORS 头；典型部署中，代理仍被服务端调用方使用，浏览器不直接访问。

## 阶段三：客户端鉴权

提取客户端 Key 的函数：`extractProxyApiKey`，`route.ts:2249`。三种 header 按以下顺序判定，先命中先用：

```ts
// route.ts:2253-2268（节选）
const fromAuthorization = extractApiKey(request.headers.get("authorization"));
if (fromAuthorization) return { keyValue: fromAuthorization, authSource: "authorization" };

const fromApiKey = extractApiKey(request.headers.get("x-api-key"));
if (fromApiKey) return { keyValue: fromApiKey, authSource: "x-api-key" };

const fromGoogleApiKey = extractApiKey(request.headers.get("x-goog-api-key"));
if (fromGoogleApiKey) return { keyValue: fromGoogleApiKey, authSource: "x-goog-api-key" };
```

`extractApiKey` 同时识别 `Bearer <key>` 与裸字符串两种写法。任意一种 header 都能通过，目的是兼容 OpenAI SDK（`Authorization: Bearer`）、Anthropic SDK（`x-api-key`）与 Gemini SDK（`x-goog-api-key`）的默认行为。

提取到候选 Key 后，鉴权依次执行以下检查：

1. **存在性**（`route.ts:2448`）：`keyValue` 为空 → `{ "error": "Missing API key" }` HTTP 401。
2. **bcrypt 比对**（`route.ts:2460`）：以 prefix 找出候选记录，调用 `verifyApiKey(keyValue, candidate.keyHash)`（内部 `bcrypt.compare`）。比对失败 → `{ "error": "Invalid API key" }` HTTP 401（`route.ts:2472`）。
3. **过期判定**（`route.ts:2463`）：`candidate.expiresAt && candidate.expiresAt < new Date()` → `{ "error": "API key has expired" }` HTTP 401。

注意这三类早期错误响应体里**只有一个 `error` 字符串字段**，没有 `code` 或 `error_code`，与后续路由阶段的统一错误格式不同。客户端如果要按机器可读规则区分原因，需要解析这个字符串本身。

## 阶段四：路由能力解析与模型提取

`handleProxy` 在鉴权通过后立刻把请求映射为一个 `RouteCapability`，所有后续上游筛选都基于这个枚举值。

**路径 → 能力映射**：`resolveRouteCapability(method, path, headers)`，`src/lib/services/route-capability-matcher.ts:307`。内部分两步：

1. `matchProtocolFamily`（`route-capability-matcher.ts:171`）：按 URL 路径段匹配基础协议族，例如 `chat/completions` → `openai_chat_compatible`，`messages` → `anthropic_messages`，`responses` → `openai_responses`，`v1beta/models/<model>:generateContent` → `gemini_native_generate`。
2. `resolveFinalCapability`（`route-capability-matcher.ts:218`）：再结合请求头中的 client profile 做升级。例如 Claude Code CLI 的特征 header 会把 `anthropic_messages` 升级为 `claude_code_messages`，Codex CLI 会把 `openai_responses` 升级为 `codex_cli_responses`。

`RouteCapability` 的全部取值定义在 `src/lib/route-capabilities.ts:1`：

```
"anthropic_messages" | "claude_code_messages" |
"openai_responses" | "codex_cli_responses" |
"openai_chat_compatible" | "openai_extended" |
"gemini_native_generate" | "gemini_code_assist_internal"
```

**模型提取**：`extractRequestContext`，`route.ts:2390`。单次解析请求体，按协议族取值：

- OpenAI / Anthropic：`bodyJson.model`（`route.ts:2408`）。
- Gemini：`extractGeminiModelFromPath(path)`（`route.ts:2391`、`route-capability-matcher.ts:279`），从 URL 路径段 `v1beta/models/<model>:generateContent` 中取出 `<model>`。
- 最终：`model = modelFromBody ?? modelFromPath`（`route.ts:2413`）。

当请求体里 `bodyJson.model` 是 string 时直接采用，否则 `modelFromBody` 为 `null`（`route.ts:2408`）。当 `modelFromBody` 与 `modelFromPath` 都为 `null` 时，最终 `model` 字段也是 `null`，AutoRouter **不会**在本地拒绝该请求：`filterCandidatesByModelRules`（`route.ts:591`）在 `originalModel` 为 null 时直接返回全部候选（`route.ts:595-600`），请求仍会进入阶段五并被转发到选中的上游。若调用方因此收到 400，错误来自上游侧的响应，而非 AutoRouter 的统一错误层。

## 阶段五：候选过滤与上游选路

进入上游选路前要先确定候选集合。`handleProxy` 在 `route.ts:2628-2654` 附近做受限模式过滤：

```ts
// route.ts:2628-2654（节选）
const accessMode = validApiKey.accessMode ?? "restricted";
const allowedUpstreamIds =
  accessMode === "restricted"
    ? storedAllowedUpstreamIds // 来自 apiKeyUpstreams 关联表
    : activeUpstreams.map((u) => u.id); // unrestricted: 全部活跃上游
```

`storedAllowedUpstreamIds` 来自 `apiKeyUpstreams` 表，是该客户端 Key 创建或编辑时绑定的上游集合。受限模式下未绑定的上游一律不可见；非受限模式下任何活跃上游都可被命中（具体能否承接当前请求，仍由路由能力与模型可用性进一步过滤）。

接下来在候选内做选路。整套逻辑分为三层：

1. **熔断状态过滤**（`src/lib/services/load-balancer.ts:243`，`filterByCircuitBreaker`）：
   - `OPEN` 状态且距离开启时间 `< openDuration` → 跳过（`load-balancer.ts:273-279`）。
   - `HALF_OPEN` 状态且距离上次探测 `< probeInterval` → 跳过（`load-balancer.ts:289-295`）。
   - 其余进入下一步。
2. **模型匹配**（`src/lib/services/model-router.ts`）：根据请求模型名结合每个上游的 `model_rules` 与 `model_redirects` 决定是否承接，承接的上游进入加权选择池。
3. **加权随机选择**（`src/lib/services/load-balancer.ts:485`，`selectWeightedWithHealthScore`）：当前实现只用一种策略——加权随机叠加延时分数。有效权重 = `upstream.weight * latencyScore`，`latencyPenalty = min(latencyMs / 500, 0.5)`（`load-balancer.ts:496`）。当所有候选 `totalWeight == 0` 时退化为纯随机（`load-balancer.ts:510`）。

选中候选后转发前再申请一次熔断器准入（`src/lib/services/circuit-breaker.ts:160`，`acquireCircuitBreakerPermit`）。若期间状态已切换到 `OPEN`，直接抛 `CircuitBreakerOpenError`（`circuit-breaker.ts:183`），由失败转移逻辑接住（见下一阶段）。

熔断器自身是个三态机：`CLOSED`（默认）/ `OPEN`（熔断中，拒绝新流量）/ `HALF_OPEN`（半开，按 `probeInterval` 节奏放探测请求）。状态枚举定义在 `circuit-breaker.ts:13-17`，状态持久化在 `circuitBreakerStates` 表中。状态机的完整行为详见 [`docs/circuit-breaker.md`](/circuit-breaker)。

## 阶段六：上游转发与流式包装

转发函数：`forwardRequest(request, upstream, path, requestId, ...)`，`src/lib/services/proxy-client.ts:984`。流程如下：

1. **header 处理**：调用 `filterHeaders`（`proxy-client.ts:216`）剔除 hop-by-hop header；调用 `injectAuthHeader`（`proxy-client.ts:237`）按上游配置注入正确的鉴权 header（部分上游用 `Authorization`、部分用 `x-api-key` 或 `x-goog-api-key`）。
2. **发起请求**：通过 `fetch` 把改写后的请求体发到上游（`proxy-client.ts:1129`）。
3. **响应类型判定**：上游响应若带 `content-type: text/event-stream`，进入 SSE 流式分支；否则按非流式整体回传。

SSE 分支的处理（`proxy-client.ts:1179` 起）：

- `createSSETransformer`：把 chunk 解析为标准 `data: ...\n\n` 事件。
- `stream.tee()`：分出两路，一路给客户端、一路给日志侧用于提取 token 计数与 TTFT。
- `waitForFirstStreamContent`（`proxy-client.ts:1210`）：实现 first-byte 超时，避免上游长时间不吐第一块。

回到 `handleProxy`，给客户端的那一路再被包一层 `wrapStreamWithConnectionTracking`（`route.ts:1975`）：

- 每次 `read()` 与 `streamIdleTimeoutMs` 超时 promise 竞争（`route.ts:2004-2007`）。
- `abortSignal.abort` 触发（典型场景：客户端关连接）时，调用 `reader.cancel` 并释放上游侧并发槽位（`route.ts:2031-2033`）。
- 流正常完成后释放槽位（`route.ts:2063`），并 fire-and-forget 调 `markHealthy` 与 `recordSuccess` 通知健康与熔断模块（`route.ts:2066-2067`）。

**失败转移分两类，行为不一样**：

- **首字节前的失败（可重试）**（`route.ts:1538` 起）：上游返回响应头时如果 `shouldTriggerFailover(result.statusCode, config)` 为真（典型：5xx、特定错误码、连接超时），记录此次失败、释放连接、调 `markUnhealthy` 与 `recordFailure`，向本次请求的 `failoverHistory` 数组追加一条记录（`route.ts:1559`），把当前上游加入「已失败」集合，`continue` 重新进入阶段五选下一条候选。当且仅当全部候选都失败时，才向调用方返回最终错误。这一阶段的重试对调用方完全无感。
- **流开始后的中断（不可重试）**（`route.ts:1592-1651`）：一旦 `result.isStream === true`，函数直接 `return` 包装好的流给调用方（`route.ts:1651`），中途读流失败由 `wrapStreamWithConnectionTracking` 的回调（`route.ts:1618-1649`）交给 `settleStreamRuntimeFailureForCircuitBreaker` 处理——只更新日志、记录熔断失败、释放连接，**不会**回到阶段五选另一条上游接着吐 chunk。调用方此时看到的是一条提前结束的 SSE 流，需要自行处理「上游 stream 中断」这一错误。

`failoverHistory` 数组在请求结束时随日志一起写入 `requestLogs.failoverHistory` 字段，可在管理后台「请求日志」详情页查看每一次尝试的 upstream_id、错误类型、状态码与时间戳。流式中断的失败记录入口不在这个数组，而是写入流式日志更新（阶段七的 `metricsPromise.then(...)` 路径）。

## 阶段七：日志、计费、响应回写

**请求日志**：`src/lib/services/request-logger.ts`。

- `logRequestStart`（`request-logger.ts:333`）：请求进入时**同步 await** 写入一行 `requestLogs`，状态 `in-progress`，所有 token / latency 字段先填 0。
- `updateRequestLog`（`request-logger.ts:381`）：请求结束或失败时 await 更新同一行（非流式路径在 `route.ts:3669` 与 `route.ts:4051`）。SSE 流式路径下，token 与 TTFT 在 `metricsPromise.then(...)` 内异步算完后再更新（`route.ts:3548`），失败用 `.catch` 兜底为 fire-and-forget。
- `logRequest`（`request-logger.ts:467`）：无 `requestLogId` 时的兜底单次 INSERT，用于异常分支。

**计费**：`src/lib/services/billing-cost-service.ts`。

- 入口：`calculateAndPersistRequestBillingSnapshot`（`billing-cost-service.ts:431`），由 `route.ts:136` 的 `persistBillingSnapshotSafely` 封装做错误兜底。
- 时机：日志写入后立即 **await**——非流式在 `route.ts:3739-3748`，流式在 `metricsPromise.then(...)` 内（`route.ts:3530-3545`）。
- 写入：`requestBillingSnapshots` 表，使用 Drizzle 的 `onConflictDoUpdate`（`billing-cost-service.ts:118`）实现幂等 upsert，对同一 `request_log_id` 多次写入安全。

**响应 header 回写**：`route.ts:3192` 用 `new Headers(result.headers)` 拷贝得到响应 header，但 `result.headers` 不是上游原始 header 的 1:1 副本，已经经过 `proxy-client.ts` 两道处理——`proxy-client.ts:1147-1153` 的 inline 循环按 `HOP_BY_HOP_HEADERS` 集合过滤上游响应头去掉 hop-by-hop 字段（与请求侧 `filterHeaders` 是两段不同代码）；当 undici 解压响应体时 `proxy-client.ts:1157-1159` 再删 `content-encoding` 与 `content-length`。SSE 分支额外强制写入 `Content-Type: text/event-stream`、`Cache-Control: no-cache`、`Connection: keep-alive`（`route.ts:3557-3559`）。代理层**不会**追加任何 AutoRouter 专属 header（既无 `X-AutoRouter-Request-Id`，也无 `X-AutoRouter-Upstream-Id`）。请求 ID 与命中上游 ID 只通过管理后台「请求日志」回查。

**统一错误格式**：路由阶段及之后的所有错误经 `src/lib/services/unified-error.ts` 包装，响应体形如 `{ error: { code, message, ... } }`，状态码与错误码的映射定义在 `unified-error.ts` 的 `STATUS_CODE_MAP`。注意阶段三的鉴权早期错误**不经过**这一层，格式更朴素（只有顶层 `error` 字段，无 `code`）。

**流量录制**：`src/lib/services/traffic-recorder.ts`。

- 决策：`shouldRecordFixture(outcome, settings)`（`traffic-recorder.ts:158`）依据 `trafficRecordingSettings` 表的运行期配置（`enabled` + `mode`）判断当前请求是否录制。该开关现为 DB 运行期配置，详见 [`.env` 配置参考](../deployment/env-reference) 中的 RECORDER 章节。
- 时机：鉴权通过后立即按需读入请求体快照（`route.ts:2485`，`recorderEnabled ? await readRequestBody(request) : null`）；响应完成后在日志写入后 `void recordTrafficFixture(...).catch(...)` 异步落盘（`route.ts:3796` 与 `route.ts:4034`），错误不阻塞调用方响应。

## 时序总览

```
客户端
  │   POST /api/proxy/v1/chat/completions
  ▼
[1] 方法分发  ──────────►  handleProxy（route.ts:2434）
  ▼
[2] CORS / OPTIONS（无自定义 handler；CORS_ORIGINS 当前无运行期效果）
  ▼
[3] 鉴权
      ├ 缺 key  → 401 { error: "Missing API key" }
      ├ bcrypt 失败 → 401 { error: "Invalid API key" }
      └ 已过期 → 401 { error: "API key has expired" }
  ▼
[4] 路由能力 + 模型解析
      route-capability-matcher.ts → RouteCapability
      bodyJson.model 或 URL 路径
  ▼
[5] 候选过滤 + 选路
      受限模式 → apiKeyUpstreams 过滤
      熔断状态 → filterByCircuitBreaker
      模型匹配 → model-router.ts
      加权随机 → selectWeightedWithHealthScore
      申请准入 → acquireCircuitBreakerPermit（OPEN 抛 CircuitBreakerOpenError）
  ▼
[6] 转发
      proxy-client.forwardRequest → 上游
      SSE → tee + wrapStreamWithConnectionTracking
      失败 → 记 failoverHistory，回到 [5] 选下一条
  ▼
[7] 日志 / 计费 / 响应
      requestLogs 更新
      requestBillingSnapshots upsert
      上游 header 透传 + SSE 强制写三个标准头
      traffic-recorder fire-and-forget
  ▼
客户端 ← 2xx 响应体（与上游一致）或统一错误格式
```

## 不在本页范围内

- 客户端 Key 的创建与可见性配置：见 [创建客户端 API Key](../usage/client-keys)。
- 上游配置字段与能力声明：见 [添加第一个上游](../usage/first-upstream)。
- 各类 SDK 调用样例：见 [通过 AutoRouter 调用模型](../usage/invoke-models)。
- 熔断器与失败转移的状态机细节：见 [`docs/circuit-breaker.md`](/circuit-breaker)。
- 模型路由规则与多上游同模型的调度细节：后续「模型路由规则」「负载均衡与权重」专题文档。
