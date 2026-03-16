## ADDED Requirements

### Requirement: 请求日志列表必须在模型名后显示 thinking badge
管理端请求日志列表在日志存在显式 thinking 或 reasoning 配置时，必须在模型名后显示一个紧凑的 badge，帮助用户快速识别本次请求设置了什么等级或预算，且不得新增独立的 thinking 列。

#### Scenario: 日志存在显式 reasoning 等级
- **WHEN** 某条日志包含可显示的 thinking 配置
- **THEN** 模型名后必须显示紧凑的 badge，例如 `[high]`、`[xhigh]` 或等价的 provider 特定短标签

#### Scenario: 日志没有显式 thinking 配置
- **WHEN** 某条日志的 thinking 配置为空
- **THEN** 模型名后不得显示占位 badge，也不得显示伪造的默认等级

#### Scenario: 现有表格列结构保持稳定
- **WHEN** thinking 配置展示接入日志列表
- **THEN** 系统不得新增独立的 thinking 列，而必须复用现有模型单元格承载 badge

### Requirement: 请求日志详情必须将请求配置与响应 usage 分区展示
管理端请求日志详情必须为 thinking 配置提供独立展示区域，并与 token usage、billing 和路由决策等响应侧或执行侧信息分开显示。

#### Scenario: 详情页展示 OpenAI reasoning 配置
- **WHEN** 用户展开包含 OpenAI thinking 配置的日志详情
- **THEN** 界面必须在独立区域展示 provider、协议、等级和值来源，并不得把该信息混入 token usage 明细

#### Scenario: 详情页展示 Anthropic 或 Gemini 预算类配置
- **WHEN** 用户展开包含 `budget_tokens` 或 `thinkingBudget` 的日志详情
- **THEN** 界面必须清晰展示预算值，并区分其与响应 token 消耗的含义

#### Scenario: 详情页遇到空配置
- **WHEN** 用户展开未显式设置 thinking 配置的日志详情
- **THEN** 界面必须显示明确的空状态文案，例如“未显式指定”，而不是显示 provider 默认值

### Requirement: 显示文案必须保留 provider 语义差异
系统在展示 thinking 配置时，必须保留 provider 的字段语义差异，避免把预算、等级和模式混为同一种概念。

#### Scenario: Anthropic adaptive thinking 与 manual thinking 并存
- **WHEN** 日志中存在 Anthropic `effort` 与 `thinking.budget_tokens` 两类不同配置来源
- **THEN** 界面必须区分显示其模式和字段含义，不得统一渲染成单一“等级”

#### Scenario: Gemini thinkingLevel 与 thinkingBudget 并存
- **WHEN** Gemini 请求同时包含 `thinkingLevel` 与 `thinkingBudget`
- **THEN** 界面必须分别展示等级和值，并保留其原始字段语义
