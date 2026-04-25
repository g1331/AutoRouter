## MODIFIED Requirements

### Requirement: 会话标识符提取
系统 SHALL 从入站请求中自动提取会话标识符，提取策略按最终路由能力类型区分：

- `anthropic_messages`、`claude_code_messages`：从 `body.metadata.user_id` 中提取 `_session_{uuid}` 的 UUID 部分
- `openai_responses`、`codex_cli_responses`、`openai_chat_compatible`、`openai_extended`：按以下顺序提取
  1) 头部：`headers.session_id`、`headers.session-id`、`headers.x-session-id`、`headers.x-session_id`、`headers.x_session_id`
  2) 请求体：`body.prompt_cache_key`、`body.metadata.session_id`、`body.previous_response_id`
- 其他能力类型或无法提取时：返回 `{ sessionId: null, source: null }`

提取结果 SHALL 统一返回 `{ sessionId: string | null; source: "header" | "body" | null }` 结构，其中：
- `source="header"`：会话标识符来自请求头
- `source="body"`：会话标识符来自请求体字段
- `source=null`：未提取到会话标识符

#### Scenario: 通用 Anthropic Messages 提取会话标识符
- **WHEN** 请求命中能力类型 `anthropic_messages`，且 `body.metadata.user_id` 包含 `_session_{uuid}` 格式
- **THEN** 系统提取出 session UUID，返回 `{ sessionId: "<uuid>", source: "body" }`

#### Scenario: Claude Code Messages 提取会话标识符
- **WHEN** 请求命中能力类型 `claude_code_messages`，且 `body.metadata.user_id` 包含 `_session_{uuid}` 格式
- **THEN** 系统提取出 session UUID，返回 `{ sessionId: "<uuid>", source: "body" }`

#### Scenario: OpenAI Responses 与 Codex CLI Responses 从头部提取会话标识符
- **WHEN** 请求命中能力类型 `openai_responses` 或 `codex_cli_responses`，且头部存在可用会话标识符
- **THEN** 系统按头部优先顺序提取并返回 `{ sessionId: "<value>", source: "header" }`

#### Scenario: OpenAI Responses 与 Codex CLI Responses 请求体回退提取会话标识符
- **WHEN** 请求命中能力类型 `openai_responses` 或 `codex_cli_responses`，且头部未提取到会话标识符，但请求体存在 `prompt_cache_key`、`metadata.session_id` 或 `previous_response_id`
- **THEN** 系统按请求体回退顺序提取并返回 `{ sessionId: "<value>", source: "body" }`

#### Scenario: 无法提取会话标识符
- **WHEN** 请求中不包含可识别的会话标识符
- **THEN** 系统返回 `{ sessionId: null, source: null }`，后续路由走正常加权选择逻辑

### Requirement: 亲和性路由集成
系统 SHALL 在 upstream 选择流程中集成亲和性查询，作为现有加权选择逻辑的前置优化，并确保同一会话仅在相同最终能力类型内复用绑定；CLI 专属请求即使回退到同协议的通用 upstream，也 MUST 继续使用 CLI 专属最终能力作为 affinity scope。

#### Scenario: 有亲和性绑定且 upstream 可用
- **WHEN** 会话存在亲和性绑定，且绑定的 upstream 处于可用状态
- **THEN** 系统直接返回绑定的 upstream，跳过加权选择

#### Scenario: 有亲和性绑定但绑定 upstream 不可用
- **WHEN** 会话存在亲和性绑定，但绑定的 upstream 不可用或被当前请求排除
- **THEN** 系统仅对本次请求回退到正常加权选择逻辑，不立即覆盖原亲和性绑定

#### Scenario: CLI 专属请求回退到通用 upstream 时保持独立 scope
- **WHEN** 请求最终能力为 `codex_cli_responses` 或 `claude_code_messages`，且本次因缺少专属候选而回退到同协议的通用 upstream
- **THEN** 系统仍以 CLI 专属最终能力作为 affinity scope
- **AND** 不得把该绑定并入 `openai_responses` 或 `anthropic_messages` 的亲和性空间

#### Scenario: 同一 session 在通用与 CLI 专属能力下不得共享绑定
- **WHEN** 同一 `sessionId` 先后出现在 `openai_responses` 与 `codex_cli_responses`，或先后出现在 `anthropic_messages` 与 `claude_code_messages`
- **THEN** 系统不得复用跨能力类型的绑定，并走各自能力范围内的正常选择逻辑

#### Scenario: 无会话标识符
- **WHEN** 请求没有会话标识符（`sessionId=null`）
- **THEN** 系统走现有的加权选择逻辑，行为与改动前完全一致
