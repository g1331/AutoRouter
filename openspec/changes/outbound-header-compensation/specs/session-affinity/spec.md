## MODIFIED Requirements

### Requirement: 会话标识符提取
系统 SHALL 从入站请求中自动提取会话标识符，提取策略按 providerType 区分：
- Anthropic：从 `body.metadata.user_id` 中提取 `session_` 后的 UUID 部分
- OpenAI：从 `headers.session_id` 中直接获取值
- 其他 providerType 或无法提取时：返回 `{ sessionId: null, source: null }`

提取结果 SHALL 以 `{ sessionId: string | null; source: "header" | "body" | null }` 结构返回，其中 `source` 标识会话标识符的提取来源：
- `"header"`：从请求头部提取
- `"body"`：从请求体字段提取
- `null`：未能提取到会话标识符

#### Scenario: Anthropic 请求提取会话标识符
- **WHEN** 收到 providerType 为 anthropic 的请求，且 `body.metadata.user_id` 包含 `_session_{uuid}` 格式
- **THEN** 系统提取出 session UUID 作为会话标识符，返回 `{ sessionId: "<uuid>", source: "body" }`

#### Scenario: OpenAI 请求从头部提取会话标识符
- **WHEN** 收到 providerType 为 openai 的请求，且 headers 中包含 `session_id`
- **THEN** 系统使用该 header 值作为会话标识符，返回 `{ sessionId: "<value>", source: "header" }`

#### Scenario: OpenAI 请求从请求体回退提取会话标识符
- **WHEN** 收到 providerType 为 openai 的请求，headers 中不包含 `session_id`，但请求体中存在可提取的会话标识符字段（如 `previous_response_id`）
- **THEN** 系统从请求体中提取会话标识符，返回 `{ sessionId: "<value>", source: "body" }`

#### Scenario: 无法提取会话标识符
- **WHEN** 请求中不包含可识别的会话标识符
- **THEN** 系统返回 `{ sessionId: null, source: null }`，后续路由走正常加权选择逻辑
