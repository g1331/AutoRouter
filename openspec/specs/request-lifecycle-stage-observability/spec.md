# request-lifecycle-stage-observability Specification

## Purpose
TBD - created by archiving change request-lifecycle-routing-diagnostics. Update Purpose after archive.
## Requirements
### Requirement: 请求生命周期状态必须可确定且可复算
系统 MUST 基于请求日志字段提供可确定的生命周期状态，并保证同一条日志在任意读取时可复算为一致结果。

#### Scenario: 决策阶段状态判定
- **WHEN** 日志记录 `status_code` 为空且 `routing_decision.did_send_upstream` 为 `false`
- **THEN** 系统 SHALL 将该请求判定为“决策中”

#### Scenario: 请求阶段状态判定
- **WHEN** 日志记录 `status_code` 为空且 `routing_decision.did_send_upstream` 为 `true`
- **THEN** 系统 SHALL 将该请求判定为“请求中”

#### Scenario: 完成状态判定
- **WHEN** 日志记录存在 `status_code`
- **THEN** 系统 SHALL 将 2xx 判定为“完成-成功”，将 4xx/5xx 判定为“完成-失败”

### Requirement: 阶段耗时口径必须统一
系统 MUST 提供统一的阶段耗时口径，以支持日志列表单行展示阶段与子阶段耗时。

#### Scenario: 流式请求的响应阶段拆分
- **WHEN** 请求为流式并存在 `duration_ms`、`routing_duration_ms`、`ttft_ms`
- **THEN** 系统 SHALL 能计算并输出“决策耗时、首 token 耗时、生成耗时”

#### Scenario: 未发往上游请求的耗时展示
- **WHEN** `routing_decision.did_send_upstream` 为 `false`
- **THEN** 系统 SHALL 将非决策耗时归类为网关处理耗时，并明确上游响应耗时不可用

### Requirement: 展开详情中的生命周期叙事必须保持严格顺序语义
系统 MUST 在展开详情中按时间顺序展示请求进入、决策结果、执行尝试、响应输出与完成结果，并避免使用脱离上下文的布尔文案。

#### Scenario: 决策阶段包含最终选择结果
- **WHEN** 用户查看某条日志的展开详情
- **THEN** 系统 SHALL 在“决策”阶段同时展示筛选依据、最终选中上游与对应选择原因
- **AND** 不得再以独立平级阶段重复表达“上游选择”

#### Scenario: 请求阶段使用动作语义
- **WHEN** `routing_decision.did_send_upstream` 为 `true` 或 `false`
- **THEN** 系统 SHALL 以“已向某上游发起请求”或“未发送到上游”表达请求阶段
- **AND** 不得仅展示孤立的“是 / 否”布尔标签

#### Scenario: 阶段时间同时提供累计与增量语义
- **WHEN** 某阶段存在可展示的时间信息
- **THEN** 系统 SHALL 以“累计耗时（+ 本阶段新增）”的形式展示该阶段时间

