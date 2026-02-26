## ADDED Requirements

### Requirement: 代理层必须采集上游首字耗时（TTFT）
系统 MUST 在 SSE 流式请求中记录从上游请求发出到第一个有效 SSE data event 到达的时间差（毫秒级精度），并持久化到 request_logs 表的 ttft_ms 字段。

#### Scenario: 流式请求记录 TTFT
- **WHEN** 代理层向上游发送流式请求并收到第一个包含有效内容的 SSE data event
- **THEN** 系统 SHALL 计算从 fetch 发出到该 event 的时间差，并将其记录为 ttft_ms

#### Scenario: 非流式请求的 TTFT 为空
- **WHEN** 代理层向上游发送非流式请求
- **THEN** 系统 SHALL 将 ttft_ms 记录为 NULL

#### Scenario: TTFT 排除非内容事件
- **WHEN** 上游在输出有效内容前先发送元数据事件（如 Anthropic 的 message_start 中不含实际文本内容的事件）
- **THEN** 系统 SHALL 以第一个包含非空 data 载荷的 SSE event 为 TTFT 终点，而非以任意 SSE event 为准

### Requirement: 代理层必须记录请求的流式类型
系统 MUST 在 request_logs 表中记录每个请求是否为流式响应（is_stream 字段），用于区分 TPS 计算的适用场景。

#### Scenario: SSE 流式响应标记为流式
- **WHEN** 上游返回 content-type 为 text/event-stream 的响应
- **THEN** 系统 SHALL 将 is_stream 设置为 true

#### Scenario: 非流式响应标记为非流式
- **WHEN** 上游返回非 SSE 格式的响应（如 application/json）
- **THEN** 系统 SHALL 将 is_stream 设置为 false

### Requirement: 数据库 schema 必须支持新增指标字段
系统 MUST 在 request_logs 表（PostgreSQL 和 SQLite 双 schema）新增 ttft_ms 和 is_stream 字段，并通过数据库迁移完成 schema 变更。

#### Scenario: PostgreSQL schema 迁移
- **WHEN** 执行数据库迁移
- **THEN** request_logs 表 SHALL 新增 ttft_ms (integer, nullable) 和 is_stream (boolean, default false) 字段

#### Scenario: SQLite schema 迁移
- **WHEN** 使用 SQLite 数据库执行迁移
- **THEN** request_logs 表 SHALL 新增 ttft_ms (integer, nullable) 和 is_stream (integer mode boolean, default false) 字段

### Requirement: TPS 必须基于精确公式实时计算
系统 MUST 使用 `completionTokens / ((durationMs - routingDurationMs - ttftMs) / 1000)` 公式计算 TPS，且仅对流式请求计算。

#### Scenario: 流式请求计算 TPS
- **WHEN** 请求为流式（is_stream=true）且 completionTokens >= 10 且生成时间 > 100ms
- **THEN** 系统 SHALL 按公式计算 TPS 并在展示层显示

#### Scenario: 非流式请求不计算 TPS
- **WHEN** 请求为非流式（is_stream=false）
- **THEN** 系统 SHALL 不计算 TPS，展示为空或不显示

#### Scenario: 生成时间过短时不计算 TPS
- **WHEN** 生成时间（durationMs - routingDurationMs - ttftMs）小于 100ms
- **THEN** 系统 SHALL 不计算 TPS，避免除法异常导致的无意义极大值

### Requirement: Cache 命中率必须使用统一公式跨 provider 计算
系统 MUST 使用可回退的统一公式计算缓存命中率，确保跨 provider 一致且命中率不会超过 100%。

#### Scenario: 聚合计算缓存命中率
- **WHEN** 系统聚合统计一段时间范围内的缓存命中率
- **THEN** 系统 SHALL 使用 `SUM(cache_read_tokens) / NULLIF(SUM(CASE WHEN prompt_tokens >= cache_read_tokens THEN prompt_tokens ELSE prompt_tokens + cache_read_tokens END), 0) * 100` 计算百分比

#### Scenario: 单请求缓存命中率
- **WHEN** 单条请求的 promptTokens > 0
- **THEN** 系统 SHALL 按以下规则计算缓存命中率：当 `promptTokens >= cacheReadTokens` 时使用 `cacheReadTokens / promptTokens * 100`，否则使用 `cacheReadTokens / (promptTokens + cacheReadTokens) * 100`

#### Scenario: 无 prompt token 时命中率为空
- **WHEN** 单条请求的 `promptTokens + cacheReadTokens` 为 0
- **THEN** 系统 SHALL 不计算缓存命中率，展示为空或不显示
