## ADDED Requirements

### Requirement: 会话标识符提取
系统 SHALL 从入站请求中自动提取会话标识符，提取策略按 providerType 区分：
- Anthropic：从 `body.metadata.user_id` 中提取 `session_` 后的 UUID 部分
- OpenAI：从 `headers.session_id` 中直接获取值
- 其他 providerType 或无法提取时：返回 null

#### Scenario: Anthropic 请求提取会话标识符
- **WHEN** 收到 providerType 为 anthropic 的请求，且 `body.metadata.user_id` 包含 `_session_{uuid}` 格式
- **THEN** 系统提取出 session UUID 作为会话标识符

#### Scenario: OpenAI 请求提取会话标识符
- **WHEN** 收到 providerType 为 openai 的请求，且 headers 中包含 `session_id`
- **THEN** 系统使用该 header 值作为会话标识符

#### Scenario: 无法提取会话标识符
- **WHEN** 请求中不包含可识别的会话标识符
- **THEN** 系统返回 null，后续路由走正常加权选择逻辑

### Requirement: 亲和性缓存存储
系统 SHALL 维护一个内存级的会话亲和性缓存，将会话标识符映射到上游 ID。

缓存 Key 为 `apiKeyId + providerType + sessionId` 的组合哈希。
缓存 Value 包含 `upstreamId`、`lastAccessedAt`、`contentLength`、`cumulativeTokens`。

#### Scenario: 写入亲和性绑定
- **WHEN** 一个有会话标识符的请求首次被路由到某上游
- **THEN** 系统将该会话与上游的绑定关系写入亲和性缓存，`cumulativeTokens` 初始为 0

#### Scenario: 响应完成后更新累计 token
- **WHEN** 一个有亲和性绑定的请求完成，响应中包含 usage 数据
- **THEN** 系统将响应的 input tokens（含 cache_read + cache_creation + input）累加到缓存条目的 `cumulativeTokens` 中

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
系统 SHALL 在上游选择流程中集成亲和性查询，作为现有加权选择逻辑的前置优化。

#### Scenario: 有亲和性绑定且上游可用
- **WHEN** 会话存在亲和性绑定，且绑定的上游处于可用状态（熔断器非 OPEN 或已到探测时间）
- **THEN** 系统直接返回绑定的上游，跳过加权选择

#### Scenario: 有亲和性绑定但上游不可用
- **WHEN** 会话存在亲和性绑定，但绑定的上游不可用
- **THEN** 系统走正常加权选择逻辑，并用新选择的上游更新缓存绑定

#### Scenario: 无会话标识符
- **WHEN** 请求没有会话标识符（sessionId 为 null）
- **THEN** 系统走现有的加权选择逻辑，行为与改动前完全一致
