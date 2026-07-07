## ADDED Requirements

### Requirement: 故障转移日志必须记录熔断计数影响
系统 MUST 在每次上游失败尝试中记录该失败是否计入熔断，以及命中的失败规则信息。

#### Scenario: 失败规则命中时记录规则证据
- **WHEN** 上游失败命中失败规则
- **THEN** failover history MUST 记录 `circuit_breaker_recorded=false`
- **AND** MUST 记录命中的规则标识、规则名称和匹配来源

#### Scenario: 失败计入熔断时记录计数影响
- **WHEN** 上游失败未命中忽略规则且路径允许影响熔断
- **THEN** failover history MUST 记录 `circuit_breaker_recorded=true`

### Requirement: 日志时间线必须展示响应超时失败
系统 MUST 在日志详情和路由决策时间线中展示首字超时和流式空闲超时，并与普通请求超时、队列等待超时、下游断开区分。

#### Scenario: 首字超时展示为上游响应失败
- **WHEN** failover history 中存在 `first_byte_timeout`
- **THEN** 日志时间线 SHALL 展示该上游在首字到达前超时
- **AND** 展示该失败是否计入熔断

#### Scenario: 流式空闲超时展示为响应期间失败
- **WHEN** 请求日志记录 `stream_idle_timeout`
- **THEN** 日志时间线 SHALL 展示该失败发生在响应流期间
- **AND** 不得展示为下游主动断开

## MODIFIED Requirements

### Requirement: 失败请求必须保留上游错误证据
系统 MUST 在管理端日志中保留并展示上游失败响应的核心证据，以支持定位“上游返回了什么”，并在失败规则命中时展示规则证据和熔断计数影响。

#### Scenario: 上游返回错误响应时保留证据
- **WHEN** 请求已发送到上游且上游返回非 2xx
- **THEN** 日志记录 MUST 保留上游状态码、错误消息与错误体摘要

#### Scenario: 失败规则命中时保留规则证据
- **WHEN** 上游失败证据命中失败规则
- **THEN** 日志记录 MUST 保留命中的规则标识、规则名称和该失败未计入熔断的事实

#### Scenario: 未发送到上游时不伪造上游错误
- **WHEN** `did_send_upstream` 为 `false`
- **THEN** 日志记录 MUST 明确该失败发生在网关侧，且不得填充伪造上游响应内容

#### Scenario: 错误证据输出遵循安全边界
- **WHEN** 管理端读取失败证据
- **THEN** 系统 MUST 对敏感字段执行脱敏并对错误体执行长度截断
