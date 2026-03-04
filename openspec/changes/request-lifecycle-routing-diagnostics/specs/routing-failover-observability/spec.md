## MODIFIED Requirements

### Requirement: 日志时间线必须可视化并发满转移链路
系统 SHALL 在日志时间线中展示“并发满 -> 转移 -> 最终路由结果”的关键步骤，并且候选上游状态展示 MUST 与真实熔断状态一致。

#### Scenario: 有并发满转移时显示链路
- **WHEN** 请求至少发生一次因并发满触发的转移
- **THEN** 日志时间线 MUST 显示每次转移的上游、时间与原因

#### Scenario: 紧凑视图保留并发满信号
- **WHEN** 管理员在日志表格紧凑视图查看请求
- **THEN** 系统 MUST 提供可识别的并发满转移标识，支持快速筛查异常路径

#### Scenario: 候选熔断状态展示准确
- **WHEN** 候选上游在路由时处于 `open` 或 `half_open`
- **THEN** 路由决策展示 MUST 显示对应真实状态，禁止统一显示为 `closed`

## ADDED Requirements

### Requirement: 失败请求必须保留上游错误证据
系统 MUST 在管理端日志中保留并展示上游失败响应的核心证据，以支持定位“上游返回了什么”。

#### Scenario: 上游返回错误响应时保留证据
- **WHEN** 请求已发送到上游且上游返回非 2xx
- **THEN** 日志记录 MUST 保留上游状态码、错误消息与错误体摘要

#### Scenario: 未发送到上游时不伪造上游错误
- **WHEN** `did_send_upstream` 为 `false`
- **THEN** 日志记录 MUST 明确该失败发生在网关侧，且不得填充伪造上游响应内容

#### Scenario: 错误证据输出遵循安全边界
- **WHEN** 管理端读取失败证据
- **THEN** 系统 MUST 对敏感字段执行脱敏并对错误体执行长度截断
