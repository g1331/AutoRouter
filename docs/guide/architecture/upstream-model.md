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

### 路由能力与模型规则

| 字段                 | 类型                           | 作用                                                                      |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `route_capabilities` | `json (string[])`              | 该上游能处理哪些 `RouteCapability`，运行期会被规范化                      |
| `model_rules`        | `json (UpstreamModelRule[])`   | 当前统一的模型匹配规则，详见下文                                          |
| `allowed_models`     | `json (string[])`              | **legacy 字段**，仅在 `model_rules` 为空时降级生效（每项当 `exact` 规则） |
| `model_redirects`    | `json (Record<string,string>)` | **legacy 字段**，仅在 `model_rules` 为空时降级生效（每项当 `alias` 规则） |
| `is_active`          | `boolean`                      | `false` 时整个上游不参与任何路由（管理后台「禁用」）                      |

`UpstreamModelRule` 的 TypeScript 定义在 `src/lib/services/upstream-model-types.ts:42-48`：

```ts
interface UpstreamModelRule {
  type: "exact" | "regex" | "alias";
  value: string; // exact 名称 / 正则表达式 / alias 源名
  targetModel: string | null; // 仅 alias 类型有值
  source: "manual" | "native" | "inferred" | "litellm";
  displayLabel: string | null;
}
```

三种规则类型的匹配语义在 `src/lib/services/upstream-model-rules.ts:326`：

- `exact`：`rule.value === model` 严格相等
- `alias`：`rule.value === model` 命中后通过 `resolveAliasTarget` 解析 `targetModel`，支持多层别名链（最深 10 跳，循环检测）
- `regex`：`new RegExp(rule.value).test(model)` 全字段正则匹配

::: warning model_redirects 与 model_rules 的 alias **不改写转发 body**
两者解析出的「目标模型名」只用于**过滤候选**、**写日志** 和 **计费价格解析** 三件事，**不会**改写客户端请求 body 里的 `model` 字段。`forwardRequest` 把原始 model 原样发给上游（`src/lib/services/proxy-client.ts:1004, 1116`），唯一会改写 body 的路径是 CLIProxyAPI 上游：当 `selectedUpstream.cliproxyAuthFileName` 存在时，代理层构造 `cliproxyModelOverride` 传给 `forwardRequest`（`route.ts:1519-1530, 1540`），由 `applyModelOverride` 改写 body。

这意味着：给一个普通 OpenAI 上游配置 `model_redirects: { "gpt-4o-mini": "gpt-4o" }`，客户端发 `gpt-4o-mini`，候选筛选与日志会按 `gpt-4o` 来，但实际打到上游的 body 里仍是 `gpt-4o-mini`。需要真正的服务端 model 改写时，应当在客户端层面解决，或者走 CLIProxyAPI 集成。
:::

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
路由层判断 provider 的依据是 `route_capabilities`，不是某个独立列。`getPrimaryProviderByCapabilities()`（`route-capabilities.ts:223`）按能力前缀映射出 `anthropic` / `openai` / `google`。
:::

## 候选池构建：第一阶段（按 RouteCapability + 模型规则）

候选池的构建发生在 `handleProxy`（`src/app/api/proxy/v1/[...path]/route.ts:2440`）内部，按「能力 → API Key 授权 → 模型规则」三层过滤，最终交给 `selectFromUpstreamCandidates`。

::: tip 关于 routeByModel
`src/lib/services/model-router.ts:306` 的 `routeByModel(model)` 实现了一套基于模型名前缀（`claude-` / `gpt-` / `gemini-`）推断 provider type 再过滤候选的算法，但**当前运行期没有任何生产路径调用它**——全仓库 `routeByModel(` 仅匹配定义本身。代理路径采用的是下文描述的 `resolveRouteCapabilityCandidatePool` + `filterCandidatesByModelRules`，按客户端**请求路径**解析出的 `RouteCapability` 与 `model_rules` 进行匹配，与模型名前缀无关。阅读源码时如果落到 `routeByModel` 上，可以视为历史代码。
:::

### 步骤 1：按 RouteCapability + API Key 授权构建候选池

`resolveRouteCapabilityCandidatePool`（`route.ts:662`）签名：

```ts
function resolveRouteCapabilityCandidatePool(
  activeUpstreams: Upstream[],
  allowedUpstreamIdSet: Set<string>,
  requestedCapability: RouteCapability,
  candidateCapability: RouteCapability
): RouteCapabilityCandidatePool;
```

`activeUpstreams` 是数据库查出的全部 `is_active=true` 上游（`route.ts:2654`）；`allowedUpstreamIdSet` 在 `restricted` 模式下取 API Key 绑定的 `api_key_upstreams` 集合，`unrestricted` 模式下取全集（`route.ts:2657-2661`）。

过滤逻辑（`route.ts:668-670`）：

```ts
const capabilityCandidates = activeUpstreams.filter((upstream) =>
  resolveRouteCapabilities(upstream.routeCapabilities).includes(candidateCapability)
);
```

随后再用 `allowedUpstreamIdSet` 做授权过滤（`route.ts:671-673`），得到 `authorizedCapabilityCandidates`，并把这一层结果命名输出在 `RouteCapabilityCandidatePool`（`route.ts:654-660`）：

- `capabilityCandidates`：能力匹配但不限授权
- `authorizedCapabilityCandidates`：能力匹配 + API Key 授权
- `candidateUpstreamIds`：上一层 ID 列表，是后续函数的实际输入

主候选池在 `route.ts:2663` 构建。如果客户端命中的是 CLI 窄能力（`codex_cli_responses` / `claude_code_messages`），代理还会在 `route.ts:2669` 用 `getFallbackRouteCapability` 解析出的通用能力构建第二个 fallback 池，由 `shouldPreferGenericFallbackPool` 决定使用哪个。

### 步骤 2：按 model_rules 过滤候选

`filterCandidatesByModelRules`（`route.ts:592`）以请求 body 里的 `model` 字段为输入：

```ts
function filterCandidatesByModelRules(
  originalModel: string | null,
  candidates: Upstream[]
): { allowed: Upstream[]; excluded: RoutingExcluded[] };
```

行为（`route.ts:595-622`）：

- `originalModel` 为 `null`（请求 body 没有 `model` 字段）→ 全部放行，不过滤
- 否则对每个候选调用 `resolvePathRoutingModelForUpstream(originalModel, candidate)`：
  - 命中（`matched: true`）→ 加入 `allowed`
  - 未命中且上游有显式规则（`hasExplicitRules: true`）→ 加入 `excluded`，理由 `"model_not_allowed"`
  - 未命中且上游没有任何规则（`hasExplicitRules: false`）→ **仍加入 `allowed`**（视为「不限制」）

这步调用在 `route.ts:2755`，紧跟主候选池构建之后；fallback 池切换时第二次调用在 `route.ts:3068`。

### 步骤 3：resolvePathRoutingModelForUpstream 与规则合并

每个候选上游被 `filterCandidatesByModelRules` 调用时，最终落到 `resolvePathRoutingModelForUpstream`（`route.ts:558`），它内部调用 `matchUpstreamModelRules` 完成实际匹配，返回：

```ts
{
  (matched, hasExplicitRules, resolvedModel, redirectApplied);
}
```

`normalizeUpstreamModelRules`（`upstream-model-rules.ts:189`）是规则合并的统一入口：

- `model_rules` 非空 → 逐条规范化为 `exact` / `regex` / `alias`
- `model_rules` 为空 → 降级兼容旧字段：把 `allowed_models` 的每一项转成 `exact` 规则，把 `model_redirects` 的每一项转成 `alias` 规则

匹配按规则数组顺序逐条尝试，第一条命中即生效。命中 `alias` 规则后通过 `resolveAliasTarget` 解析 `targetModel`（多层别名链，最深 10 跳）。

### 步骤 4：resolvedModel 的真实用途

`resolvePathRoutingModelForUpstream` 返回的 `resolvedModel` 在四处被消费（`route.ts:2853, 3085, 3148, 3903`）：

1. 决定 API Key 配额检查时用哪个 model 名（计费维度对齐）
2. 写入 `request_logs` 与 `RoutingDecisionLog.resolved_model`
3. `request_billing_snapshots` 计算模型价格时使用
4. failover 错误路径中以最终归因上游计算 `resolvedModel` 后写入失败日志

如前文「路由能力与模型规则」section 所述，**`resolvedModel` 不参与请求 body 改写**，仅普通上游的 body 里 `model` 字段保持客户端原值。

### 步骤 5：候选 ID 列表交给 load-balancer

走到这里得到 `candidateUpstreamIds`（已通过 capability、API Key 授权、model_rules 三重过滤），由 `handleProxy` 在 `route.ts:3045` / `route.ts:3100`（fallback 路径）传给 `forwardWithFailover`，后者在 `route.ts:1386` 调用 `selectFromUpstreamCandidates` 进入第二阶段。

## load-balancer 选上游：第二阶段（按 tier + 加权）

候选 ID 列表传给 `selectFromUpstreamCandidates`（`src/lib/services/load-balancer.ts:675`），由它执行 tier 过滤、加权抽样、session affinity。

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

最近一次记录的 `latency_ms`（来自 `upstream_health` 表）越大、分越低。但要注意：当前 `markHealthy` 调用点写入的 latency 固定为 `100`（`src/lib/services/health-checker.ts` + `route.ts:1601, 2072`），不是实测值。因此 `score` 在当前实现里基本恒为 1.0，加权采样近似等价于按 `upstream.weight` 加权随机。

加权抽样完成后输出的 `selectedUpstream` 即为本次实际转发目标。

### Session affinity 与迁移

`selectFromUpstreamPool`（`load-balancer.ts:764-950`）会先按 `(apiKeyId, routeCapability, sessionId)` 查 session 缓存：

- 命中且目标可用 → 直接返回该上游，标记 `affinityHit: true`
- 命中但当前优先级更高的上游可用 → 按 `upstream.affinityMigration.metric`（`tokens` 或 `length`）累计、与 `threshold` 比较，达到阈值才允许迁移，标记 `affinityMigrated: true`

### 路由层错误

| 错误类                              | 触发条件                                              |
| ----------------------------------- | ----------------------------------------------------- |
| `NoAuthorizedUpstreamsError`        | API Key 授权集合与候选集合无交集                      |
| `NoHealthyUpstreamsError`           | 所有 tier 全部过滤后仍为空                            |
| `AllCandidatesConcurrencyFullError` | 候选池存在但全部 `concurrency_full`，可能携带等待句柄 |

错误类定义在 `load-balancer.ts:29, 39, 49`。`AllCandidatesConcurrencyFullError` 携带的 `waitableCandidate` 会被代理入口拿去做队列等待（`route.ts:1409-1469`），等待超时则抛 `UpstreamQueueWaitTimeoutError` 转 504，详见 [失败转移与熔断](./failover-circuit)。

## 健康状态与路由的关系

`upstream_health` 表（`schema-pg.ts:133-152`）记录 `is_healthy`、`latency_ms`、`failure_count`、`error_message` 等。代码里有两处「健康写入」入口：

| 写入函数                             | 触发点                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `markHealthy(upstreamId, latencyMs)` | 请求成功（`route.ts:1601` 非流式；`route.ts:2072` 流式完成）                                      |
| `markUnhealthy(upstreamId, reason)`  | HTTP 非 2xx（`route.ts:1559`）、网络/超时错误（`route.ts:1722`）、流式中途错误（`route.ts:2103`） |

::: warning is_healthy 不直接参与路由
`load-balancer.ts:1033` 的 `filterByExclusions` 注释明确写着：

> Filter by exclusion list (health status is display-only, not used for routing)

实际「能不能被选中」由熔断器状态决定，`upstream_health.is_healthy` 字段只用于管理后台的可视化展示。这意味着：手动把某个上游的 `is_healthy` 改成 `false` 不会让它从候选池里消失；要禁用必须改 `is_active` 或让熔断器进入 OPEN。
:::

## 调用链一览

| 入口                                                                           | 行号      | 作用                               |
| ------------------------------------------------------------------------------ | --------- | ---------------------------------- |
| `src/app/api/proxy/v1/[...path]/route.ts` `handleProxy`                        | 2440      | 代理主流程容器                     |
| ↳ `resolveRouteCapability(method, path, headers)`                              | 2504      | 路径 → RouteCapability             |
| ↳ `resolveRouteCapabilityCandidatePool`                                        | 2663      | 按主能力 + API Key 授权构建候选池  |
| ↳ `getFallbackRouteCapability` + 副候选池                                      | 2669-2678 | CLI 能力降级路径                   |
| ↳ `filterCandidatesByModelRules`                                               | 2755      | 按 `model_rules` 过滤候选          |
| ↳ `forwardWithFailover(... candidateUpstreamIds ...)`                          | 3045      | 故障转移主循环                     |
| `src/app/api/proxy/v1/[...path]/route.ts` `resolvePathRoutingModelForUpstream` | 558       | 实际匹配规则、产出 `resolvedModel` |
| `src/lib/services/upstream-model-rules.ts` `normalizeUpstreamModelRules`       | 189       | model_rules / 旧字段统一规范化     |
| `src/lib/services/upstream-model-rules.ts` `matchUpstreamModelRules`           | 326       | 三种规则类型的实际匹配             |
| `src/lib/services/load-balancer.ts` `selectFromUpstreamCandidates`             | 675       | tier 过滤 + 加权抽样               |
| ↳ `performTieredSelection`                                                     | 983       | 内部 tier 循环                     |
| ↳ `selectWeightedWithHealthScore`                                              | 485       | 加权抽样实现                       |

读源码时按这条链顺着走即可。后续上游被选中后的转发、SSE 处理、失败重试由 [请求生命周期](./request-lifecycle) 和 [失败转移与熔断](./failover-circuit) 接力描述。
