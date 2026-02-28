# session-affinity Specification

## Purpose
TBD - created by archiving change session-affinity. Update Purpose after archive.
## Requirements
### Requirement: 会话标识符提取
系统 SHALL 从入站请求中自动提取会话标识符，提取策略按路由能力类型区分：
- `anthropic_messages`：从 `body.metadata.user_id` 中提取 `_session_{uuid}` 的 UUID 部分
- `codex_responses`、`openai_chat_compatible`、`openai_extended`：按以下顺序提取
  1) 头部：`headers.session_id`、`headers.session-id`、`headers.x-session-id`、`headers.x-session_id`、`headers.x_session_id`
  2) 请求体：`body.prompt_cache_key`、`body.metadata.session_id`、`body.previous_response_id`
- 其他能力类型或无法提取时：返回 `{ sessionId: null, source: null }`（系统不再接受 provider 类型兜底输入）

提取结果 SHALL 统一返回 `{ sessionId: string | null; source: "header" | "body" | null }` 结构，其中：
- `source="header"`：会话标识符来自请求头
- `source="body"`：会话标识符来自请求体字段
- `source=null`：未提取到会话标识符

#### Scenario: Anthropic 能力请求提取会话标识符
- **WHEN** 请求命中能力类型 `anthropic_messages`，且 `body.metadata.user_id` 包含 `_session_{uuid}` 格式
- **THEN** 系统提取出 session UUID，返回 `{ sessionId: "<uuid>", source: "body" }`

#### Scenario: OpenAI 兼容能力请求提取会话标识符
- **WHEN** 请求命中能力类型 `codex_responses`、`openai_chat_compatible` 或 `openai_extended`，且头部存在可用会话标识符
- **THEN** 系统按头部优先顺序提取并返回 `{ sessionId: "<value>", source: "header" }`

#### Scenario: OpenAI 兼容能力请求体回退提取会话标识符
- **WHEN** 请求命中能力类型 `codex_responses`、`openai_chat_compatible` 或 `openai_extended`，且头部未提取到会话标识符，但请求体存在 `prompt_cache_key`、`metadata.session_id` 或 `previous_response_id`
- **THEN** 系统按请求体回退顺序提取并返回 `{ sessionId: "<value>", source: "body" }`

#### Scenario: 无法提取会话标识符
- **WHEN** 请求中不包含可识别的会话标识符
- **THEN** 系统返回 `{ sessionId: null, source: null }`，后续路由走正常加权选择逻辑

### Requirement: 亲和性缓存存储
系统 SHALL 维护一个内存级的会话亲和性缓存，将会话标识符映射到上游 ID。

缓存 Key 为 `apiKeyId + routeCapability + sessionId` 的组合哈希。
缓存 Value 包含 `upstreamId`、`lastAccessedAt`、`contentLength`、`cumulativeTokens`。

#### Scenario: 写入亲和性绑定
- **WHEN** 一个有会话标识符的请求首次被路由到某上游
- **THEN** 系统将该会话与上游的绑定关系写入亲和性缓存，`cumulativeTokens` 初始为 0

#### Scenario: 响应完成后更新累计 token
- **WHEN** 一个有亲和性绑定的请求完成，响应中包含 usage 数据
- **THEN** 系统按能力类型计算并累加 `totalInputTokens` 到 `cumulativeTokens`，避免重复统计缓存 token：`anthropic_messages` 在有原始 input token 时累加 `input + cache_read + cache_creation`，否则使用已聚合值；OpenAI 兼容能力使用请求统计中的 `promptTokens`

#### Scenario: 查询亲和性绑定
- **WHEN** 一个有会话标识符的请求到达，且亲和性缓存中存在该会话的绑定
- **THEN** 系统返回绑定的上游 ID

#### Scenario: 绑定不存在
- **WHEN** 一个有会话标识符的请求到达，但亲和性缓存中无该会话的绑定
- **THEN** 系统走正常加权选择逻辑，并将结果写入缓存

### Requirement: 亲和性 TTL 管理
系统 SHALL 对亲和性缓存条目实施滑动窗口 TTL 机制。

- 默认 TTL 为 5 分钟
- 每次缓存命中时刷新 `lastAccessedAt`
- 最大 TTL 上限为 30 分钟
- 系统 SHALL 定期清理过期条目

#### Scenario: TTL 内命中
- **WHEN** 会话请求到达，且缓存条目的 `lastAccessedAt` 距当前时间不超过 TTL
- **THEN** 系统返回绑定的上游 ID，并刷新 `lastAccessedAt`

#### Scenario: TTL 过期
- **WHEN** 会话请求到达，但缓存条目的 `lastAccessedAt` 距当前时间已超过 TTL
- **THEN** 系统删除该条目，走正常加权选择逻辑

#### Scenario: 定期清理
- **WHEN** 清理周期到达
- **THEN** 系统移除所有已过期的缓存条目

### Requirement: 亲和性路由集成
系统 SHALL 在上游选择流程中集成亲和性查询，作为现有加权选择逻辑的前置优化，并确保同一会话仅在相同能力类型内复用绑定。

#### Scenario: 有亲和性绑定且上游可用
- **WHEN** 会话存在亲和性绑定，且绑定的上游处于可用状态（熔断器非 OPEN 或已到探测时间）
- **THEN** 系统直接返回绑定的上游，跳过加权选择

#### Scenario: 有亲和性绑定但绑定上游不可用
- **WHEN** 会话存在亲和性绑定，但绑定的上游不可用或被当前请求排除
- **THEN** 系统仅对本次请求回退到正常加权选择逻辑，不立即覆盖原亲和性绑定

#### Scenario: 有亲和性绑定但能力类型不一致
- **WHEN** 会话存在亲和性绑定，但当前请求能力类型与绑定创建时的能力类型不同
- **THEN** 系统不得复用该绑定，并走当前能力类型下的正常加权选择逻辑

#### Scenario: 无会话标识符
- **WHEN** 请求没有会话标识符（sessionId 为 null）
- **THEN** 系统走现有的加权选择逻辑，行为与改动前完全一致
