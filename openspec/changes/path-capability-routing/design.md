## Context

当前代理链路仍保留了 `model -> provider_type` 的兼容路径，导致系统在“路径能力路由”和“模型路由”之间并行决策。  
这对命令行客户端不够友好，因为请求是否可路由本质由路径能力决定，而不是模型前缀。

现状流程（简化）：

```text
Client Request
   |
   v
Match route capability
   |
   v
selectFromCandidateUpstreams(...)
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

### Decision 1: 引入固定能力类型字典并只保留路径能力路由

选择固定能力类型字典进行路径归类，并将其作为唯一选路入口。  
若未命中能力类型，直接返回标准化错误，不再进入模型路由兜底。

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
- 继续保留模型兜底。缺点是会持续耦合 `model` 与兼容字段，路由原理不单一。
- 全量用户自定义路径规则。缺点是首版维护成本和错误配置风险过高。

### Decision 2: 上游仅保留能力配置，移除兼容提供商字段

在 upstream 配置中新增 `routeCapabilities: string[]`，用于声明“该上游可接哪些路径能力”。  
`provider_type/providerType` 从数据模型、接口契约和管理端配置中移除。  
迁移阶段仅对历史能力集合做规范化（去重、去空、移除非法项），不再依据 provider 生成默认映射。

### Decision 3: 路由候选集构建改为“能力过滤 + 候选集选择器”

候选集构建顺序：

1. 路径归类能力类型  
2. 按能力过滤上游  
3. 按 API Key 授权过滤上游  
4. 按熔断状态过滤上游  
5. 进入现有分层优先级 + 权重选择器

负载均衡入口改为“按候选上游 ID 集合”选择，不再以 provider 作为主键。

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
│ allowedModels [....] modelRedirects [....]  │
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
4. 模型规则字段（折叠展示）

### Decision 6: 路由日志记录能力命中信息

新增日志字段（或路由决策扩展字段）：

- `matched_route_capability`
- `route_match_source`（固定为 `path`）
- `capability_candidates_count`

用于快速排查“为什么这次请求走到这个上游”。

## Risks / Trade-offs

- [能力映射不全导致未命中] → 返回明确错误并记录请求路径，运营侧按日志补齐能力映射。
- [移除 provider 字段导致历史接口不兼容] → 同步升级 API 契约与管理端，并在变更说明中声明破坏性升级。
- [会话亲和性维度变化导致短期命中率波动] → 保留迁移窗口期观测指标，异常时可回退到旧键策略。
- [图标资产缺失或视觉不一致] → 提供统一图标映射表和兜底通用图标，避免出现空白占位。

## Migration Plan

1. 数据层保证 `route_capabilities` 可用并清理历史非法值。  
2. 后端移除模型兜底路径和 provider 主键选路逻辑。  
3. Admin API 与前端移除 `provider_type` 字段输入输出。  
4. 管理端保留能力多选 UI，并收敛兼容文案。  
5. 完成回归测试后发布破坏性升级版本。  

回滚策略：

- 恢复上一版本代码与数据库 schema（包含 provider 字段）。
- 通过版本回滚恢复旧契约，不做运行时双逻辑开关。

## Open Questions

- 是否在下一阶段开放“自定义路径规则”能力，让企业可扩展非内置接口路径。
- `openai_extended` 是否要按能力细分为更小粒度（例如 embeddings 与 images 分离），以便做更精确的上游授权。
