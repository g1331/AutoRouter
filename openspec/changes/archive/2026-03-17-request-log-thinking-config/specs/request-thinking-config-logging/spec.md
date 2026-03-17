## ADDED Requirements

### Requirement: 系统必须从请求体提取显式的 thinking 或 reasoning 配置
系统在处理支持的 JSON 请求协议时，必须从请求体中提取显式传入的 thinking 或 reasoning 配置，并将其归一化为统一的请求日志配置对象。系统不得依赖响应 usage、响应摘要或 SSE 事件去反推该配置。

#### Scenario: OpenAI Responses 请求显式设置 reasoning.effort
- **WHEN** 请求命中 `openai_responses` 或 `codex_cli_responses` 能力，且请求体包含 `reasoning.effort`
- **THEN** 系统必须将该值记录到归一化 thinking 配置对象中，并标记来源为 `reasoning.effort`

#### Scenario: OpenAI Chat 请求显式设置 reasoning_effort
- **WHEN** 请求命中 `openai_chat_compatible` 能力，且请求体包含 `reasoning_effort`
- **THEN** 系统必须将该值记录到归一化 thinking 配置对象中，并标记来源为 `reasoning_effort`

#### Scenario: Anthropic 请求显式设置 effort 或 thinking 配置
- **WHEN** 请求命中 `anthropic_messages` 或 `claude_code_messages` 能力，且请求体包含 `effort` 或 `thinking.type` 或 `thinking.budget_tokens`
- **THEN** 系统必须将显式存在的字段写入归一化 thinking 配置对象，并保留对应来源路径

#### Scenario: Gemini 请求显式设置 thinkingLevel 或 thinkingBudget
- **WHEN** 请求命中 `gemini_native_generate` 或 `gemini_code_assist_internal` 能力，且请求体包含 `generationConfig.thinkingConfig.thinkingLevel` 或 `generationConfig.thinkingConfig.thinkingBudget`
- **THEN** 系统必须将显式存在的字段写入归一化 thinking 配置对象，并保留对应来源路径

### Requirement: 系统必须正确处理缺失值和非 JSON 请求
系统在请求体不是有效 JSON、字段未显式指定或协议不支持 thinking 配置时，必须返回空配置，而不是写入推断出的默认等级或预算。

#### Scenario: 请求体不是有效 JSON
- **WHEN** 代理入口无法将请求体解析为 JSON 对象
- **THEN** 系统必须将 thinking 配置记为 `null`，且不得影响现有请求处理结果

#### Scenario: 请求未显式设置 thinking 配置
- **WHEN** 请求协议支持 thinking 控制，但请求体未显式包含相关字段
- **THEN** 系统必须将 thinking 配置记为 `null` 或 `explicit=false` 的空状态，且不得伪造 provider 默认值

### Requirement: 系统必须持久化并返回请求侧 thinking 配置
系统必须将归一化后的 thinking 配置作为请求日志的一部分持久化，并通过管理端日志 API 返回给前端。历史记录和空值记录必须保持向后兼容。

#### Scenario: 新请求写入 thinking 配置
- **WHEN** 请求日志在开始或完成阶段拿到了归一化 thinking 配置
- **THEN** 系统必须在 `request_logs` 中持久化该配置，并在后续更新流程中保持一致

#### Scenario: 管理端查询日志
- **WHEN** 管理端调用日志查询接口
- **THEN** 返回结果必须包含完整的 thinking 配置对象，以供前端渲染模型名后的 badge 和详情展示

#### Scenario: 历史日志缺少新增字段
- **WHEN** 管理端读取本次变更前产生的历史日志
- **THEN** 系统必须返回 `thinking_config=null` 或等价空状态，且不得影响其他日志字段读取
