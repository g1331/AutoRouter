## Context

当前代理链路在 `handleProxy` 中先解析 `model`，再调用 `routeByModel(model)` 决定 `providerType` 和候选上游。请求路径主要用于拼接转发地址，而不是用于选路本身。  
这对命令行客户端不够友好，因为很多客户端能力是“按路径区分”的，而不是“按模型区分”的。

现状流程（简化）：

```text
Client Request
   |
   v
Extract model from body
   |
   v
routeByModel(model)
   |
   v
selectFromProviderType(...)
   |
   v
forward to /api/proxy/v1/{path}
```

目标流程（简化）：

```text
Client Request
   |
   v
Normalize path + method
   |
   v
Match route capability
   |
   v
Filter upstreams by capability + auth + health
   |
   v
Tiered selection + failover (reuse existing)
   |
   v
Forward request (same as today)
```

## Goals / Non-Goals

**Goals:**

- 将路由主判定切换为“请求路径与方法优先”。
- 支持一个上游声明多个能力类型并参与同一套故障转移。
- 让上游能力配置与展示从纯文字升级为“图标 + 文案”，降低误选概率。
- 保持现有优先级、权重、熔断、故障转移、鉴权机制不倒退。
- 提供从旧配置到新配置的平滑迁移，避免一次性手工重配。
- 让路由日志可观察到“路径能力命中结果”。

**Non-Goals:**

- 不引入跨 provider 的智能语义匹配与推荐算法。
- 不改造现有请求转发协议与 SSE 传输实现。
- 不在本次引入“用户自定义正则路径规则编辑器”（先支持固定能力类型）。

## Decisions

### Decision 1: 引入固定能力类型字典，先于模型路由执行

选择固定能力类型字典进行路径归类，并将其放在路由入口第一阶段执行。  
若命中能力类型，则走能力路由；若未命中，再进入兼容路径（模型路由兜底）。

能力类型首批清单：

| 能力类型 | 路径模式 |
| --- | --- |
| `anthropic_messages` | `POST /v1/messages`、`POST /v1/messages/count_tokens` |
| `codex_responses` | `POST /v1/responses` |
| `openai_chat_compatible` | `POST /v1/chat/completions` |
| `openai_extended` | `POST /v1/completions`、`POST /v1/embeddings`、`POST /v1/moderations`、`POST /v1/images/generations`、`POST /v1/images/edits` |
| `gemini_native_generate` | `POST /v1beta/models/{model}:generateContent`、`POST /v1beta/models/{model}:streamGenerateContent` |
| `gemini_code_assist_internal` | `POST /v1internal:generateContent`、`POST /v1internal:streamGenerateContent` |

备选方案：
- 继续模型优先，仅补路径特判。缺点是会继续耦合 `model` 字段，无法覆盖无 `model` 或内部协议路径。
- 全量用户自定义路径规则。缺点是首版维护成本和错误配置风险过高。

### Decision 2: 上游新增多能力字段，保留旧字段用于兼容期

在 upstream 配置中新增 `routeCapabilities: string[]`，用于声明“该上游可接哪些路径能力”。  
`providerType/allowedModels/modelRedirects` 在兼容期保留，作为未命中能力时的兜底逻辑与回滚手段。

迁移默认映射策略：

- `providerType=openai` -> `codex_responses` + `openai_chat_compatible` + `openai_extended`
- `providerType=anthropic` -> `anthropic_messages`
- `providerType=google` -> `gemini_native_generate`
- `providerType=custom` -> 空集合（需人工勾选）

### Decision 3: 路由候选集构建改为“能力过滤 + 原有选择器复用”

候选集构建顺序：

1. 路径归类能力类型  
2. 按能力过滤上游  
3. 按 API Key 授权过滤上游  
4. 按熔断状态过滤上游  
5. 进入现有分层优先级 + 权重选择器

这样可以最大化复用现有 `selectFromProviderType` 思路，减少重写面与回归风险。

### Decision 4: 会话亲和性键加入能力类型维度

会话亲和性绑定键由“`apiKeyId + providerType + sessionId`”扩展为“`apiKeyId + routeCapability + sessionId`”。  
目标是保证同一会话在同一路径能力内稳定命中，同时避免不同能力共享同一绑定造成错配。

### Decision 5: 管理端表单与列表使用“多选能力标签”展示

能力图标映射（首版固定）：

| 能力类型 | 图标语义 | 展示文案 |
| --- | --- | --- |
| `anthropic_messages` | 对话气泡 | Claude Messages |
| `codex_responses` | 终端/代码 | Codex Responses |
| `openai_chat_compatible` | 聊天气泡 | OpenAI Chat |
| `openai_extended` | 工具箱 | OpenAI Extended |
| `gemini_native_generate` | 星光/闪电 | Gemini Native |
| `gemini_code_assist_internal` | 扳手/IDE | Gemini Code Assist |

关键场景布局示意（上游编辑弹窗）：

```text
┌─────────────────────────────────────────────┐
│ 编辑上游                                    │
├─────────────────────────────────────────────┤
│ 名称 [.........................]            │
│ Base URL [..............................]   │
│ 优先级 [..]  权重 [..]                      │
│                                             │
│ 支持能力（可多选）                           │
│ [◉ Claude Messages] [◉ Codex Responses]     │
│ [○ OpenAI Chat]      [◉ OpenAI Extended]    │
│ [○ Gemini Native]    [○ Gemini Code Assist] │
│                                             │
│ 兼容字段（高级）                            │
│ providerType [....] allowedModels [....]    │
├─────────────────────────────────────────────┤
│ 取消                               保存      │
└─────────────────────────────────────────────┘
```

交互约束：

- 能力项为可多选，不是单选；一个上游可同时选中多个能力卡片。
- 选中态必须同时体现“图标高亮 + 背景高亮 + 勾选标记”，不能只靠颜色区分。
- 列表页能力徽章需要完整回显所有已选能力，超出宽度时折行，不折叠为“更多”。

列表视觉层级（从强到弱）：

1. 上游可用性状态（在线/熔断/禁用）  
2. 支持能力图标徽章（可一眼判断是否可接特定客户端请求，且可看出多能力并存）  
3. 优先级和权重信息  
4. 兼容字段（折叠展示）

### Decision 6: 路由日志记录能力命中信息

新增日志字段（或路由决策扩展字段）：

- `matched_route_capability`
- `route_match_source`（`path` 或 `model_fallback`）
- `capability_candidates_count`

用于快速排查“为什么这次请求走到这个上游”。

## Risks / Trade-offs

- [能力映射不全导致未命中] → 增加兼容兜底（模型路由）并在日志中标明 fallback 发生。
- [迁移后默认映射不符合个别部署] → 提供批量编辑入口与升级提示，允许逐个上游修正能力集合。
- [会话亲和性维度变化导致短期命中率波动] → 保留迁移窗口期观测指标，异常时可回退到旧键策略。
- [前后端字段并存增加复杂度] → 设定明确淘汰阶段，后续单独变更移除旧字段。
- [图标资产缺失或视觉不一致] → 提供统一图标映射表和兜底通用图标，避免出现空白占位。

## Migration Plan

1. 数据层新增 `route_capabilities` 字段，发布迁移脚本。  
2. 启动时执行一次旧字段到新字段的默认映射（可幂等重复执行）。  
3. 后端上线“路径优先 + 模型兜底”双路径，默认开启。  
4. 管理端上线能力多选 UI，并显示迁移提示。  
5. 观测命中率与 fallback 比例，确认稳定后再规划移除旧路由主逻辑。  

回滚策略：

- 路由开关切回“模型优先”模式。
- 保留旧字段不删库，回滚时无需数据恢复。

## Open Questions

- 是否在下一阶段开放“自定义路径规则”能力，让企业可扩展非内置接口路径。
- `openai_extended` 是否要按能力细分为更小粒度（例如 embeddings 与 images 分离），以便做更精确的上游授权。
