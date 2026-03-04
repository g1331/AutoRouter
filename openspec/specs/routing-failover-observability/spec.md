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
系统 SHALL 在日志时间线中展示“并发满 -> 转移 -> 最终路由结果”的关键步骤。

#### Scenario: 有并发满转移时显示链路
- **WHEN** 请求至少发生一次因并发满触发的转移
- **THEN** 日志时间线 MUST 显示每次转移的上游、时间与原因

#### Scenario: 紧凑视图保留并发满信号
- **WHEN** 管理员在日志表格紧凑视图查看请求
- **THEN** 系统 MUST 提供可识别的并发满转移标识，支持快速筛查异常路径

### Requirement: 并发满转移必须与熔断失败语义区分
系统 SHALL 在日志语义层面区分“容量满载转移”和“上游故障转移”。

#### Scenario: 并发满不归类为上游故障
- **WHEN** 请求仅因并发满发生转移
- **THEN** 日志中的失败阶段与原因 MUST 反映容量约束语义，而非网络/服务故障语义

