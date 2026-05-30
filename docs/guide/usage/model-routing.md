---
title: 模型路由规则
outline: deep
---

# 模型路由规则

AutoRouter 选择上游的决策依据并非「模型名前缀映射」这类预设规则，而是一组可叠加的可配置约束。本页按选路顺序展开：先讲请求路径与请求头如何确定本次请求的「路由能力」、再讲上游如何声明自己能承接哪些能力与模型、再讲规则匹配与模型名重写的精确语义、最后讲客户端可见模型白名单的两层叠加。

读完之后，可以把任何一个「模型字段写什么 → 命中哪条上游」的问题对照源码自行还原。

## 第一层：路由能力（RouteCapability）筛选

`src/lib/route-capabilities.ts:1-10` 定义了 8 种 `RouteCapability`：

```
"anthropic_messages"       | "claude_code_messages"
"openai_responses"         | "codex_cli_responses"
"openai_chat_compatible"   | "openai_extended"
"gemini_native_generate"   | "gemini_code_assist_internal"
```

每种能力对应一个 `CapabilityProvider`（`route-capabilities.ts:93-102`）：`anthropic_*` → `anthropic`，`openai_*` / `codex_*` → `openai`，`gemini_*` → `google`。

入口函数 `resolveRouteCapability(method, path, headers)`（`src/lib/services/route-capability-matcher.ts:307`）分两步把请求映射为一个 `RouteCapability`：

### 步骤 1：协议族匹配

`matchProtocolFamily(method, path)`（`route-capability-matcher.ts:171`）按路径段匹配出基础协议族：

| 请求路径模板                                          | 协议族 / 基础能力             |
| ----------------------------------------------------- | ----------------------------- |
| `POST .../messages`                                   | `messages`（先记下）          |
| `POST .../responses`                                  | `responses`（先记下）         |
| `GET v1/models`                                       | `openai_chat_compatible`      |
| `POST .../chat/completions`                           | `openai_chat_compatible`      |
| `POST .../completions` / `embeddings` / `moderations` | `openai_extended`             |
| `POST .../images/*`                                   | `openai_extended`             |
| `POST v1beta/models/<m>:generateContent`              | `gemini_native_generate`      |
| `POST v1beta/models/<m>:streamGenerateContent`        | `gemini_native_generate`      |
| `POST v1internal:generateContent`                     | `gemini_code_assist_internal` |
| `POST v1internal:streamGenerateContent`               | `gemini_code_assist_internal` |
| 其他 / 含路径遍历                                     | `null` → 直接拒绝             |

### 步骤 2：客户端 profile 升级

`resolveFinalCapability(protocolFamily, headers)`（`route-capability-matcher.ts:218`）再看请求头中的 CLI profile，把基础态升级到 CLI 专属态：

| 协议族      | 升级触发条件（任一满足）                                                                  | 升级后能力             |
| ----------- | ----------------------------------------------------------------------------------------- | ---------------------- |
| `messages`  | `anthropic-beta` 含 `claude-code-`；或 `User-Agent` 起 `claude-cli/` 且 `x-app: cli`      | `claude_code_messages` |
| `messages`  | 不满足上述                                                                                | `anthropic_messages`   |
| `responses` | `originator: codex_cli_rs`；或 `User-Agent` 起 `codex_cli_rs/`；或任意 `x-codex-*` header | `codex_cli_responses`  |
| `responses` | 不满足上述                                                                                | `openai_responses`     |

最终 `RouteCapability` 决定本次请求只能命中**声明了该能力的上游**。

## 第二层：上游声明 route_capabilities

`upstreams` 表的 `route_capabilities` 字段（`src/lib/db/schema-pg.ts:89`）是一个可空 JSON 字符串数组（无 DB default，新字段默认为 `null`）。管理员在「上游管理」表单中勾选该上游能承接哪些能力。

`null` 与空数组的处理：实际的迁移与匹配逻辑保证「未声明 = 不可用」，所以新建上游一定要勾上至少一个能力。

启动期一次性迁移：`ensureRouteCapabilityMigration()`（`src/lib/services/route-capability-migration.ts:125`）在进程启动后执行幂等迁移，过 `normalizeRouteCapabilitiesWithMeta()` 去掉非法值、把旧值 `codex_responses` 重映射为 `openai_responses`（`route-capabilities.ts:19-21`）。被规范化过的上游会回写数据库，并在日志里提示管理员若是 CLI 专属应改为 `codex_cli_responses`（`route-capability-migration.ts:84-93`）。

## 第三层：模型规则（model_rules / model_redirects / allowed_models）

上游有三个相关字段（`src/lib/db/schema-pg.ts:90-91, 100`）：

| 字段              | 含义                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model_rules`     | 新版规则数组，每条规则形如 `{ type, value, target_model, source, display_label }`，`type` 取值 `exact \| regex \| alias`（见 `src/lib/services/upstream-model-types.ts:42-48`） |
| `allowed_models`  | 旧版精确模型白名单，单纯一组字符串                                                                                                                                              |
| `model_redirects` | 旧版模型重定向映射 `{ "客户端模型名": "上游侧别名" }`                                                                                                                           |

三者关系：`normalizeUpstreamModelRules`（`src/lib/services/upstream-model-rules.ts:189`）优先读 `model_rules`；若 `model_rules` 为空，则把 `allowed_models` 转成 `exact` 规则、把 `model_redirects` 转成 `alias` 规则，实现向后兼容。

### 三种 rule type 的语义

| `type`  | 语义                                                                     | 是否改写模型名 |
| ------- | ------------------------------------------------------------------------ | -------------- |
| `exact` | 客户端模型名严格等于 `value` 时匹配                                      | 否             |
| `regex` | 客户端模型名匹配 `value` 中的正则时匹配                                  | 否             |
| `alias` | 客户端模型名与 `value` 精确相等时匹配，转发时把模型名换为 `target_model` | 是             |

`alias` 链可以传递：A → B → C，最多追踪 10 跳后停止以防环（`upstream-model-rules.ts:131`）。

### 规则匹配出口：resolvePathRoutingModelForUpstream

`resolvePathRoutingModelForUpstream(originalModel, upstream)`（`src/app/api/proxy/v1/[...path]/route.ts:558`）是路由层使用的统一出口。内部调用 `matchUpstreamModelRules`（`upstream-model-rules.ts:326`），返回四个字段：

| 字段               | 含义                                                         |
| ------------------ | ------------------------------------------------------------ |
| `matched`          | 该上游是否接受 `originalModel`                               |
| `hasExplicitRules` | 该上游是否配置了任何规则（`model_rules` / 兼容来源非空）     |
| `resolvedModel`    | 真正向上游转发时使用的模型名（`alias` 命中时替换；否则原样） |
| `redirectApplied`  | 是否发生了模型名替换                                         |

### 「未显式拒绝即默认放行」语义

整体过滤逻辑在 `filterCandidatesByModelRules`（`route.ts:592-625`）：

```ts
// 摘自 route.ts:592-625
if (!originalModel) return { allowed: candidates, excluded: [] }; // 模型缺失 → 全部放行
for (const candidate of candidates) {
  const modelResolution = resolvePathRoutingModelForUpstream(originalModel, candidate);
  if (modelResolution.matched) {
    allowed.push(candidate);
    continue;
  }
  if (modelResolution.hasExplicitRules) {
    excluded.push({ id: candidate.id, name: candidate.name, reason: "model_not_allowed" });
    continue;
  }
  allowed.push(candidate);
}
```

读出来的语义有三条，需要分别记住：

1. **请求体里没有 `model` 字段**（在 OpenAI / Anthropic 协议下 `bodyJson.model` 不是 string；Gemini 没法从路径里取出来）：所有候选都通过，请求会被转发到选中的上游，错误（如果有）来自上游而非 AutoRouter。
2. **`model` 字段存在且上游没有配置任何 model_rules（空白名单）**：默认放行。「空 = 接受所有模型」，**不是**「空 = 拒绝一切」。
3. **`model` 字段存在且上游配置了规则但都没命中**：该上游被排除，理由 `model_not_allowed`。

这条「未显式拒绝即默认放行」的语义直接影响日常配置：如果一条上游只想承接 `claude-3-5-haiku`，必须显式加一条 `exact` 或 `regex` 规则；只要 `model_rules` 为空，它就会接管所有命中其声明能力的请求。

## 旧版前缀映射的现状

`getProviderTypeForModel`（`src/lib/services/model-router.ts:105`）保留了基于前缀的映射表（`model-router.ts:20-24`）：

```
"claude-" → "anthropic"
"gpt-"    → "openai"
"gemini-" → "google"
```

但这个函数**不再被主代理路由 `src/app/api/proxy/v1/[...path]/route.ts` 调用**（全仓 grep 无 `routeByModel` 在主路由中的引用）。它现在只在两处出现：

- `model-router.ts:310` 的旧版 `routeByModel`——已不在主路由路径上。
- `src/lib/services/billing-cost-service.ts:445`——计费时用来区分输入 token 计算口径。

也就是说：当前选路完全由「route_capabilities + model_rules」两层决定，**模型前缀不再影响请求会去哪个上游**。如果想达到「`gpt-*` 默认去 OpenAI、`claude-*` 默认去 Anthropic」的效果，做法是：

- OpenAI 上游声明 `openai_chat_compatible` 等能力，不加额外规则——它会承接所有命中 `openai_chat_compatible` 路径的请求。
- Anthropic 上游声明 `anthropic_messages` 等能力，不加额外规则——它会承接 `/v1/messages`。

请求路径已经天然把 `gpt-*` 与 `claude-*` 分开了（`gpt-*` 通常在 `chat/completions`，`claude-*` 在 `messages`），不需要前缀映射这一层。

## 第四层：客户端可见模型白名单

客户端 Key 的 `allowed_models` 字段（`schema-pg.ts:55`）是另一层白名单，在候选筛选**之前**生效：

`isModelAllowedByApiKey(requestedModel, allowedModels)`（`src/lib/api-key-models.ts:16`）：`allowedModels` 为空或 null 直接放行；否则做精确字符串 `includes` 检查，命中失败的请求直接返回错误码 `API_KEY_MODEL_NOT_ALLOWED`（`route.ts:2513`）。

`getApiKeyVisibleModelList`（`route.ts:627`）仅在 `GET /v1/models` 这种返回模型列表的请求里触发：对 Key 的 `allowedModels` 做过滤，保留其中**能被至少一个候选上游接受**的模型名（用 `resolvePathRoutingModelForUpstream(model, candidate).matched` 判断），返回交集。

叠加规则三条：

1. Key 的 `allowed_models` 为空 / null → 模型层不做限制，模型列表 API 返回全部候选上游支持的模型。
2. Key 的 `allowed_models` 非空 → 调用某模型时必须在其中，否则鉴权阶段就被拒；模型列表 API 仅返回「Key 白名单」与「上游能接受」两者的**交集**。
3. 上游的 `model_rules` 与 Key 的 `allowed_models` 是**独立两层**：Key 白名单不能绕过上游层的规则。例如 Key 写了 `["gpt-4o"]` 但所有 OpenAI 上游的 `model_rules` 都明确不接受 `gpt-4o`，请求最终还是无候选可用。

## 一次请求的选路顺序

把上面四层串起来，一次请求的选路顺序如下：

```
请求 → 路径 + headers → RouteCapability
        ↓
       Key.allowed_models 白名单（早期拒绝）
        ↓
       初始候选：声明了该 RouteCapability 的活跃上游
        ↓
       受限模式过滤（如果 Key 是 restricted，按 apiKeyUpstreams 关联表限定）
        ↓
       熔断状态过滤（filterByCircuitBreaker）
        ↓
       模型规则过滤（filterCandidatesByModelRules，按 model_rules 决定 allowed / excluded）
        ↓
       加权随机选择（selectWeightedWithHealthScore，详见 docs/guide/usage/load-balancing）
        ↓
       命中候选 → 若 alias 规则命中则改写 model 字段 → 转发
```

## 调试与排查

| 现象                                          | 多半原因                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 期望命中 A 上游，但实际命中了 B 上游          | A 与 B 都声明了同一 RouteCapability 且都通过模型规则；按加权随机选了 B                             |
| 期望命中 A 上游，但被路由层拒绝（403/404）    | A 的 `route_capabilities` 没勾上该能力；或 A 的 `model_rules` 明确不接受此模型名                   |
| 想让某客户端模型名转发为另一个名字            | 在目标上游加 `alias` 规则：`{ type: "alias", value: "gpt-4o", target_model: "gpt-4o-2024-11-20" }` |
| 想让所有上游一律不接受某模型                  | 在 Key 的 `allowed_models` 外面挡掉；或在每个上游的 `model_rules` 中显式排除                       |
| Codex / Claude Code CLI 不命中预期 CPA 池上游 | 检查请求头是否带特征字段（`originator` / `anthropic-beta` 等），见上文「客户端 profile 升级」一节  |

## 不在本页范围内

- 选路的加权随机算法细节、延时分数、熔断与并发对候选池的影响：见 [负载均衡与权重](./load-balancing)。
- 熔断状态机与失败规则：见 [熔断器配置](./circuit-breaker-config)。
- 请求经过哪些阶段、每一阶段做什么：见 [请求生命周期](../architecture/request-lifecycle)。
- CLIProxyAPI 池上游能力预设：见 [CLIProxyAPI 首次使用指南](./cliproxy-first-time) 与 [`docs/cliproxy-deployment.md`](/cliproxy-deployment)。
