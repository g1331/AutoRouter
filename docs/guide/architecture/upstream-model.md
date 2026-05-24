---
title: 上游模型
outline: deep
---

# 上游模型

「上游」是 AutoRouter 路由层最核心的对象，对应一个真实可调用的 AI provider 连接：一组 `base_url` + 加密后的 API Key + 协议能力声明 + 路由权重 + 计费倍率。一次客户端请求最终会在「所有 active 上游」中按规则筛出一个候选池、按权重抽中一个具体上游、再把请求转发出去。

这一页解释「候选池如何构建」和「最终上游如何被选中」，所有引用都指向 `master` 分支的源码行号。与请求生命周期总览的关系参见 [请求生命周期](./request-lifecycle)；选中失败后的故障转移与熔断细节参见 [失败转移与熔断](./failover-circuit)；表结构与索引详情参见 [数据库 schema](./database-schema)。

## 协议能力 RouteCapability

`RouteCapability` 是 AutoRouter 把「上游能处理什么协议端点」与「客户端请求落在哪个路径」对齐的字符串枚举。源码定义在 `src/lib/route-capabilities.ts:1-10`：

| 枚举值                        | 含义                                                                  |
| ----------------------------- | --------------------------------------------------------------------- |
| `anthropic_messages`          | Anthropic Messages API（`POST /v1/messages`）                         |
| `claude_code_messages`        | Anthropic Messages + Claude Code 客户端 profile                       |
| `openai_responses`            | OpenAI Responses API（`POST /v1/responses`）                          |
| `codex_cli_responses`         | OpenAI Responses + Codex CLI 客户端 profile                           |
| `openai_chat_compatible`      | OpenAI Chat Completions / `GET /v1/models`                            |
| `openai_extended`             | OpenAI 扩展端点（completions / embeddings / images / moderations 等） |
| `gemini_native_generate`      | Google Gemini Native（`/v1beta/models/{m}:generateContent`）          |
| `gemini_code_assist_internal` | Google Gemini Code Assist Internal                                    |

枚举值按 provider 归组（`route-capabilities.ts:93-102`）：

- `anthropic` 组：`anthropic_messages`, `claude_code_messages`
- `openai` 组：`openai_responses`, `codex_cli_responses`, `openai_chat_compatible`, `openai_extended`
- `google` 组：`gemini_native_generate`, `gemini_code_assist_internal`

历史值 `codex_responses` 会被 `normalizeRouteCapabilities` 自动重映射为 `openai_responses`（`route-capabilities.ts:17-21`），数据库里旧记录在 `listUpstreams` 时会通过 `ensureRouteCapabilityMigration()` 完成一次性迁移（`src/lib/services/upstream-crud.ts:697`）。

### CLI profile 与降级

两个 CLI 后缀枚举（`codex_cli_responses`、`claude_code_messages`）是「专门匹配 CLI 客户端的窄能力」。请求路径匹配器在识别到 Codex 或 Claude Code 客户端时（通过 UA、`x-codex-*`、`anthropic-beta: claude-code-*` 等 header）才会落到这两个值上。若没有任何上游声明 CLI 能力，`getFallbackRouteCapability` 会把请求降级到对应的通用能力（`route-capabilities.ts:198`）：

- `codex_cli_responses` → `openai_responses`
- `claude_code_messages` → `anthropic_messages`

降级行为在 `src/app/api/proxy/v1/[...path]/route.ts:2663` 通过双候选池实现：先按 CLI 能力构建主池，再按 fallback 能力构建副池，由 `shouldPreferGenericFallbackPool` 决定使用哪个池。

## upstreams 表关键字段

完整列定义见 `src/lib/db/schema-pg.ts:74-128`。按用途分组介绍最常被路由层读取的字段：

### 路由能力与白名单

| 字段                 | 类型                           | 作用                                                        |
| -------------------- | ------------------------------ | ----------------------------------------------------------- |
| `route_capabilities` | `json (string[])`              | 该上游能处理哪些 `RouteCapability`，运行期会被规范化        |
| `allowed_models`     | `json (string[])`              | 模型名白名单。`null` 或空数组 = 不限制                      |
| `model_redirects`    | `json (Record<string,string>)` | 把客户端请求里的 `model` 改写为另一个值再做白名单匹配与转发 |
| `is_active`          | `boolean`                      | `false` 时整个上游不参与任何路由（管理后台「禁用」）        |

`model_redirects` 在 model-router 与请求转发两个阶段都会被应用：先按它解析 model 名再过白名单（避免别名旁路），转发时也会把 body 里的 `model` 字段改写成解析后的值。映射链限制 10 跳防循环（`src/lib/services/model-router.ts:355-381`）。

### 调度参数

| 字段                 | 类型      | 默认   | 作用                                                  |
| -------------------- | --------- | ------ | ----------------------------------------------------- |
| `priority`           | `integer` | `0`    | 值越小优先级越高，相同 `priority` 的上游归为同一 tier |
| `weight`             | `integer` | `1`    | tier 内加权随机的权重基数                             |
| `max_concurrency`    | `integer` | `null` | 单上游最大并发，`null` = 不限                         |
| `queue_policy`       | `json`    | `null` | 并发已满时是否允许排队等待，等待时长与队列容量        |
| `affinity_migration` | `json`    | `null` | session affinity 命中后是否允许迁移到更高优先级的上游 |

### 转发与加密

| 字段                | 类型      | 作用                                        |
| ------------------- | --------- | ------------------------------------------- |
| `base_url`          | `text`    | 转发目标地址                                |
| `api_key_encrypted` | `text`    | Fernet 对称加密后的上游 API Key，明文不落盘 |
| `timeout`           | `integer` | 单位**秒**（不是毫秒），默认 60             |
| `config`            | `text`    | 自定义 header 等扩展配置，JSON 字符串       |

API Key 的加解密统一通过 `src/lib/utils/encryption.ts` 提供的 `encrypt` / `decrypt`，`createUpstream` 写入时加密、转发前 `getDecryptedApiKey(upstream)` 临时解密（`upstream-crud.ts:432, 950`）。响应给前端的 DTO 用 `maskApiKey` 脱敏，格式 `sk-***1234`（`upstream-crud.ts:262`）。

### CLIProxyAPI 关联字段

| 字段                      | 类型          | 作用                                                |
| ------------------------- | ------------- | --------------------------------------------------- |
| `cliproxy_instance_id`    | `uuid`        | 外键指向 `cliproxy_instances.id`，删除实例时设 NULL |
| `cliproxy_auth_file_name` | `text`        | 该上游绑定的 CLIProxyAPI auth-file 名               |
| `cliproxy_provider`       | `varchar(32)` | 该 auth-file 对应的 OAuth provider 标识             |

详细集成机制见 [CLIProxyAPI 集成位置](./cliproxy-integration)。

### 计费倍率

`billing_input_multiplier` / `billing_output_multiplier`（默认 1.0）会乘到该上游所有请求的 token 单价上，用于「同一模型在不同上游有不同折扣」的场景。`spending_rules` 是限额规则数组，结构与 `api_keys.spending_rules` 一致，详见 [使用 / 请求日志与统计](../usage/logs-stats)。

::: tip 表里没有 `provider` 列
路由层判断 provider 的依据是 `route_capabilities`，不是某个独立列。`getPrimaryProviderByCapabilities()`（`route-capabilities.ts:93`）按能力前缀映射出 `anthropic` / `openai` / `google`。
:::

## model-router 选上游：第一阶段（按模型前缀）

入口函数 `routeByModel(model)` 位于 `src/lib/services/model-router.ts:306`，五步流程：

### 步骤 1：从 model 名推断 provider type

`getProviderTypeForModel(model)` 把 model 名 lowercase 后匹配前缀（`model-router.ts:20-24`）：

| 模型前缀  | provider type |
| --------- | ------------- |
| `claude-` | `anthropic`   |
| `gpt-`    | `openai`      |
| `gemini-` | `google`      |

无匹配的 model（例如 `qwen-max`）返回 `routingType: "none"`，表示「不按模型路由」，由路径匹配器（见 [请求生命周期](./request-lifecycle)）的 `RouteCapability` 直接决定候选池。

### 步骤 2：按 provider type 过滤 active 上游

第 335 行根据上一步结果，调用 `getPrimaryProviderByCapabilities(upstream.routeCapabilities)` 推算每个 `is_active=true` 上游所属 provider，留下匹配项作为候选。

### 步骤 3：剔除熔断 OPEN 中的上游

`filterUpstreamsByCircuitBreaker`（`model-router.ts:345`）排除状态为 `OPEN` 且尚未超过 `openDuration` 的上游，剔除原因记为 `"circuit_open"`。OPEN 超时后会被允许通过，作为 HALF_OPEN 探测请求。

### 步骤 4：白名单 + 别名解析

第 355-381 行对每个剩余上游：

1. 用 `resolveModelWithRedirects(model, upstream.modelRedirects)` 解析 model 名（最多 10 跳，循环检测）；
2. 若 `allowedModels` 非空，检查解析后的 model 是否在白名单里；
3. 第一个通过的上游被记为 `selectedUpstream`。

### 步骤 5：回退兜底

如果没有任何上游通过白名单，但确实存在健康上游，第 389 行会忽略 `allowedModels` 取第一个健康上游作 fallback。这一行为是为了避免「客户端用了一个生僻 model 名 → 全部上游拒收 → 直接 500」的可用性问题，但代价是白名单失效。

### 错误类型

| 错误类                   | 含义                                                  |
| ------------------------ | ----------------------------------------------------- |
| `NoUpstreamGroupError`   | provider type 有效，但没有任何上游声明对应 capability |
| `NoHealthyUpstreamError` | 有候选上游，但全部被熔断器过滤掉                      |

错误类定义在 `model-router.ts:72, 82`。具体 HTTP 状态码与客户端错误码映射见 [使用 / 故障排查手册](../usage/troubleshooting)。

## load-balancer 选上游：第二阶段（按 tier + 加权）

`routeByModel` 完成「按 model 选 provider type」之后，候选 ID 列表传给 `selectFromUpstreamCandidates`（`src/lib/services/load-balancer.ts:675`），由它执行 tier 过滤、加权抽样、session affinity。

### 候选池过滤顺序

核心函数 `performTieredSelection`（`load-balancer.ts:983`）按以下顺序过滤：

```
allowedUpstreamIds  → 按 API Key 授权过滤
        ↓
priority 升序分 tier
        ↓
对每个 tier 依次：
  filterByCircuitBreaker  → 排除 OPEN 且未到 openDuration 的上游
  filterBySpendingQuota   → 排除已超限额的上游
  filterByExclusions      → 排除上一次请求里失败的上游（excludeIds）
  filterByConcurrencyCapacity → 排除并发已满的上游
        ↓
通过的上游 → selectWeightedWithHealthScore（加权抽样）
```

只有当当前 tier 一个候选都不剩时，才进入下一个 tier（`load-balancer.ts:989-999`）。

### 加权抽样

`selectWeightedWithHealthScore`（`load-balancer.ts:485`）按以下公式给每个上游算 `effectiveWeight`：

```
score = 1.0 - min(latencyMs / 500, 0.5)   // 至少 0.1
effectiveWeight = upstream.weight * score
```

最近一次记录的 `latency_ms`（来自 `upstream_health` 表）越大、分越低。但要注意：当前 `markHealthy` 调用点写入的 latency 固定为 `100`（`src/lib/services/health-checker.ts` + `route.ts:1595, 2066`），不是实测值。因此 `score` 在当前实现里基本恒为 1.0，加权采样近似等价于按 `upstream.weight` 加权随机。

加权抽样完成后输出的 `selectedUpstream` 即为本次实际转发目标。

### Session affinity 与迁移

`selectFromUpstreamPool`（`load-balancer.ts:795-939`）会先按 `(apiKeyId, routeCapability, sessionId)` 查 session 缓存：

- 命中且目标可用 → 直接返回该上游，标记 `affinityHit: true`
- 命中但当前优先级更高的上游可用 → 按 `upstream.affinityMigration.metric`（`tokens` 或 `length`）累计、与 `threshold` 比较，达到阈值才允许迁移，标记 `affinityMigrated: true`

### 路由层错误

| 错误类                              | 触发条件                                              |
| ----------------------------------- | ----------------------------------------------------- |
| `NoAuthorizedUpstreamsError`        | API Key 授权集合与候选集合无交集                      |
| `NoHealthyUpstreamsError`           | 所有 tier 全部过滤后仍为空                            |
| `AllCandidatesConcurrencyFullError` | 候选池存在但全部 `concurrency_full`，可能携带等待句柄 |

错误类定义在 `load-balancer.ts:29, 39, 49`。`AllCandidatesConcurrencyFullError` 携带的 `waitableCandidate` 会被代理入口拿去做队列等待（`route.ts:1403-1463`），等待超时则抛 `UpstreamQueueWaitTimeoutError` 转 504，详见 [失败转移与熔断](./failover-circuit)。

## 健康状态与路由的关系

`upstream_health` 表（`schema-pg.ts:133-152`）记录 `is_healthy`、`latency_ms`、`failure_count`、`error_message` 等。代码里有两处「健康写入」入口：

| 写入函数                             | 触发点                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `markHealthy(upstreamId, latencyMs)` | 请求成功（`route.ts:1595` 非流式；`route.ts:2066` 流式完成）                                      |
| `markUnhealthy(upstreamId, reason)`  | HTTP 非 2xx（`route.ts:1553`）、网络/超时错误（`route.ts:1716`）、流式中途错误（`route.ts:2097`） |

::: warning is_healthy 不直接参与路由
`load-balancer.ts:1033` 的 `filterByExclusions` 注释明确写着：

> Filter by exclusion list (health status is display-only, not used for routing)

实际「能不能被选中」由熔断器状态决定，`upstream_health.is_healthy` 字段只用于管理后台的可视化展示。这意味着：手动把某个上游的 `is_healthy` 改成 `false` 不会让它从候选池里消失；要禁用必须改 `is_active` 或让熔断器进入 OPEN。
:::

## 调用链一览

| 入口                                                               | 行号      | 作用                              |
| ------------------------------------------------------------------ | --------- | --------------------------------- |
| `src/app/api/proxy/v1/[...path]/route.ts` `handleProxy`            | 2434      | 代理主流程容器                    |
| ↳ `resolveRouteCapability(method, path, headers)`                  | 2498      | 路径 → RouteCapability            |
| ↳ `resolveRouteCapabilityCandidatePool`                            | 2657      | 按主能力构建候选池                |
| ↳ `getFallbackRouteCapability` + 副候选池                          | 2663-2672 | CLI 能力降级路径                  |
| ↳ `forwardWithFailover(... candidateUpstreamIds ...)`              | 1289      | 故障转移主循环                    |
| `src/lib/services/model-router.ts` `routeByModel(model)`           | 306       | 按 model 字段筛 provider 与白名单 |
| `src/lib/services/load-balancer.ts` `selectFromUpstreamCandidates` | 675       | tier 过滤 + 加权抽样              |
| ↳ `performTieredSelection`                                         | 983       | 内部 tier 循环                    |
| ↳ `selectWeightedWithHealthScore`                                  | 485       | 加权抽样实现                      |

读源码时按这条链顺着走即可。后续上游被选中后的转发、SSE 处理、失败重试由 [请求生命周期](./request-lifecycle) 和 [失败转移与熔断](./failover-circuit) 接力描述。
