# routing-failover-observability Specification

## Purpose
TBD - created by archiving change optimize-upstream-management-experience. Update Purpose after archive.
## Requirements
### Requirement: 路由日志必须记录并发满导致的转移原因
系统 SHALL 在每次路由决策与故障转移记录中标注“并发满”相关原因，确保排障链路可追溯。

#### Scenario: 候选排除记录并发满原因
- **WHEN** 某上游因并发达到上限被排除出候选集
- **THEN** 路由决策日志 MUST 记录该上游的排除原因为 `concurrency_full`

#### Scenario: 重试记录并发满触发信息
- **WHEN** 请求在执行阶段因并发满而尝试下一个上游
- **THEN** failover history MUST 记录该尝试的错误类型为 `concurrency_full`

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

### Requirement: 并发满转移必须与熔断失败语义区分
系统 SHALL 在日志语义层面区分“容量满载转移”和“上游故障转移”。

#### Scenario: 并发满不归类为上游故障
- **WHEN** 请求仅因并发满发生转移
- **THEN** 日志中的失败阶段与原因 MUST 反映容量约束语义，而非网络/服务故障语义

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

### Requirement: 路由决策与故障转移必须保留结构化选择原因
系统 MUST 为首次选中上游和每次故障转移后的改选保留结构化 reason 字段，并在日志详情中准确展示。

#### Scenario: 首次选择原因可解释
- **WHEN** 请求完成首次路由决策并选中上游
- **THEN** 系统 MUST 保留该次选中的主导原因
- **AND** 原因至少可区分会话亲和性命中、加权选择、half-open 探测、候选收敛后的唯一可用上游

#### Scenario: 故障转移后的改选原因可解释
- **WHEN** 请求在一次失败后触发故障转移并重新选择上游
- **THEN** 系统 MUST 为每次改选保留独立 reason 字段
- **AND** 管理端 SHALL 能展示“因上一次失败什么原因而改试下一上游，以及本次为什么选中它”

