# provider-usage-normalization Specification

## Purpose
TBD - created by archiving change support-gemini-auth-and-usage-metadata. Update Purpose after archive.
## Requirements
### Requirement: 系统必须为 Gemini 原生路径请求提取模型名
System MUST extract model from Gemini native path when `body.model` is absent, and use the extracted model in request logs and billing snapshots. 系统在处理 Gemini 原生路径能力请求时，必须在 `body.model` 缺失的情况下从请求路径提取模型名，并用于日志与计费快照，避免 `model_missing` 误判。

#### Scenario: body 缺失 model 时从路径提取
- **WHEN** 请求路径为 `/v1beta/models/{model}:generateContent` 或 `/v1beta/models/{model}:streamGenerateContent` 且请求体不包含 `model`
- **THEN** 系统必须将 `{model}` 作为本次请求的 model 写入请求日志与 billing snapshot

#### Scenario: body.model 优先于路径回退
- **WHEN** 请求体包含 `model` 且路径也可解析出模型名
- **THEN** 系统必须优先使用 `body.model`，路径仅作为缺失时回退来源

#### Scenario: 非 Gemini 原生路径不触发回退提取
- **WHEN** 请求路径不匹配 Gemini 原生能力模式
- **THEN** 系统不得从路径推断 model，保持现有模型提取语义

### Requirement: Gemini 路径能力路由必须应用上游模型重定向
System MUST apply `modelRedirects` from the actually selected upstream in Gemini path-capability routing, and write redirected results into routing decisions, request logs, and billing snapshots. 系统在 Gemini 路径能力路由中必须基于实际选中的上游应用 `modelRedirects`，并将重定向结果写入路由决策、请求日志与计费快照。

#### Scenario: 选中上游配置了 modelRedirects
- **WHEN** Gemini 请求命中路径能力且最终选中的上游存在 `modelRedirects`
- **THEN** 系统必须把原始模型映射到重定向后的 `resolved_model`，并将 `model_redirect_applied` 置为 `true`

#### Scenario: 失败分支存在实际外发
- **WHEN** 请求在失败分支中 `did_send_upstream=true`
- **THEN** 系统必须按最后一次实际外发上游的 `modelRedirects` 计算 `resolved_model` 并写入失败日志与 billing snapshot

#### Scenario: 上游未配置 modelRedirects
- **WHEN** 选中的上游未配置 `modelRedirects`
- **THEN** 系统必须保持 `resolved_model=original_model` 且 `model_redirect_applied=false`

### Requirement: 系统必须解析 Gemini usageMetadata
System MUST parse Gemini `usageMetadata` and normalize it into internal token fields for logging and billing. 系统在处理 Gemini 响应时必须识别 `usageMetadata` 并归一化为内部 token 字段，以保证日志和计费链路可用。

#### Scenario: 解析 Gemini 非流式 usageMetadata
- **WHEN** 非流式响应包含 `usageMetadata.promptTokenCount`、`candidatesTokenCount`、`cachedContentTokenCount`
- **THEN** 系统必须分别映射到 `promptTokens`、`completionTokens`、`cacheReadTokens`，并产出可用的 `totalTokens`

#### Scenario: totalTokenCount 缺失时回退计算
- **WHEN** `usageMetadata.totalTokenCount` 缺失
- **THEN** 系统必须使用 `promptTokens + completionTokens` 作为 `totalTokens`

#### Scenario: 解析 Gemini 流式最终事件 usageMetadata
- **WHEN** 流式事件块中出现可解析的 `usageMetadata`
- **THEN** 系统必须触发 usage 更新并写入与非流式一致的归一化字段

### Requirement: 系统必须解析 Anthropic cache_creation TTL 细分字段
System MUST parse TTL breakdown fields under `usage.cache_creation` in Anthropic responses while preserving backward compatibility with existing `cache_creation_tokens`. 系统在处理 Anthropic 响应时必须解析 `usage.cache_creation` 中的 TTL 细分写入字段，并保持与既有 `cache_creation_tokens` 的向后兼容关系。

#### Scenario: 同时存在 5m 和 1h 细分字段
- **WHEN** 响应包含 `cache_creation.ephemeral_5m_input_tokens` 与 `cache_creation.ephemeral_1h_input_tokens`
- **THEN** 系统必须分别写入 `cacheCreation5mTokens` 与 `cacheCreation1hTokens`

#### Scenario: 细分字段缺失时兼容旧字段
- **WHEN** 响应仅包含 `cache_creation_input_tokens`，不包含 TTL 细分字段
- **THEN** 系统必须保持旧字段可用，并将 TTL 细分字段写为 0

### Requirement: usage 归一化口径必须在双路径一致
System MUST keep usage normalization semantics consistent across streaming and non-streaming fallback paths. 系统在流式解析路径和非流式回退路径上必须共享一致的 usage 字段解释规则，避免同一响应在不同路径得到不一致的结果。

#### Scenario: 同一载荷在两条路径结果一致
- **WHEN** 相同 provider usage 载荷分别经过转发解析与回退解析
- **THEN** 产出的 `prompt/completion/total/cache` 字段必须一致

#### Scenario: 旧 provider 样例结果不回归
- **WHEN** OpenAI 与 Anthropic 既有样例在新逻辑下执行
- **THEN** 系统必须保持当前已验证的字段数值与行为语义不变

### Requirement: 新增 usage 字段必须可持久化并对外输出
System MUST persist new TTL breakdown fields in request logs and expose them in API responses with backward compatibility. 系统必须将新增 TTL 细分字段纳入请求日志持久化和 API 输出模型，并以向后兼容方式提供给管理界面。

#### Scenario: request_logs 持久化新增字段
- **WHEN** 解析到 Anthropic TTL 细分字段
- **THEN** 系统必须在 `request_logs` 中持久化对应细分值

#### Scenario: logs API 输出新增字段
- **WHEN** 管理端查询日志
- **THEN** 返回模型必须包含 TTL 细分字段，且历史记录在字段缺失时返回 0

#### Scenario: 管理界面显示细分字段不破坏现有层级
- **WHEN** 日志明细存在 TTL 细分值
- **THEN** 界面必须在现有 token 细节结构内按次级层级展示，不得改变已有主信息布局

