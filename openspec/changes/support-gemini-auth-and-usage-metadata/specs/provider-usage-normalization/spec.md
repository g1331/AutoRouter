## ADDED Requirements

### Requirement: 系统必须解析 Gemini usageMetadata
系统在处理 Gemini 响应时必须识别 `usageMetadata` 并归一化为内部 token 字段，以保证日志和计费链路可用。

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
系统在处理 Anthropic 响应时必须解析 `usage.cache_creation` 中的 TTL 细分写入字段，并保持与既有 `cache_creation_tokens` 的向后兼容关系。

#### Scenario: 同时存在 5m 和 1h 细分字段
- **WHEN** 响应包含 `cache_creation.ephemeral_5m_input_tokens` 与 `cache_creation.ephemeral_1h_input_tokens`
- **THEN** 系统必须分别写入 `cacheCreation5mTokens` 与 `cacheCreation1hTokens`

#### Scenario: 细分字段缺失时兼容旧字段
- **WHEN** 响应仅包含 `cache_creation_input_tokens`，不包含 TTL 细分字段
- **THEN** 系统必须保持旧字段可用，并将 TTL 细分字段写为 0

### Requirement: usage 归一化口径必须在双路径一致
系统在流式解析路径和非流式回退路径上必须共享一致的 usage 字段解释规则，避免同一响应在不同路径得到不一致的结果。

#### Scenario: 同一载荷在两条路径结果一致
- **WHEN** 相同 provider usage 载荷分别经过转发解析与回退解析
- **THEN** 产出的 `prompt/completion/total/cache` 字段必须一致

#### Scenario: 旧 provider 样例结果不回归
- **WHEN** OpenAI 与 Anthropic 既有样例在新逻辑下执行
- **THEN** 系统必须保持当前已验证的字段数值与行为语义不变

### Requirement: 新增 usage 字段必须可持久化并对外输出
系统必须将新增 TTL 细分字段纳入请求日志持久化和 API 输出模型，并以向后兼容方式提供给管理界面。

#### Scenario: request_logs 持久化新增字段
- **WHEN** 解析到 Anthropic TTL 细分字段
- **THEN** 系统必须在 `request_logs` 中持久化对应细分值

#### Scenario: logs API 输出新增字段
- **WHEN** 管理端查询日志
- **THEN** 返回模型必须包含 TTL 细分字段，且历史记录在字段缺失时返回 0

#### Scenario: 管理界面显示细分字段不破坏现有层级
- **WHEN** 日志明细存在 TTL 细分值
- **THEN** 界面必须在现有 token 细节结构内按次级层级展示，不得改变已有主信息布局
