## ADDED Requirements

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
