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
系统 SHALL 在日志时间线中展示“并发满 -> 转移/等待 -> 恢复或超时 -> 最终路由结果”的关键步骤，并且候选上游状态展示 MUST 与真实熔断状态一致。

#### Scenario: 有等待后恢复执行时显示链路
- **WHEN** 请求先因并发满进入等待，随后恢复执行并成功或失败结束
- **THEN** 日志时间线 MUST 显示等待开始、恢复执行和最终路由结果

#### Scenario: 等待超时时显示终点
- **WHEN** 请求进入等待后因超时结束
- **THEN** 日志时间线 MUST 显示“等待开始 -> 等待超时”的终止链路

#### Scenario: 紧凑视图保留等待信号
- **WHEN** 管理员在日志表格紧凑视图查看发生过等待的请求
- **THEN** 系统 MUST 提供可识别的等待状态标识
- **AND** 管理员 MUST 能区分“等待后恢复执行”和“等待后超时”

#### Scenario: 候选熔断状态展示准确
- **WHEN** 候选上游在路由时处于 `open` 或 `half_open`
- **THEN** 路由决策展示 MUST 显示对应真实状态，禁止统一显示为 `closed`

### Requirement: 并发满转移必须与熔断失败语义区分
系统 SHALL 在日志语义层面区分“容量满载转移”“进入等待”“等待超时”“等待中断”和“上游故障转移”。

#### Scenario: 并发满进入等待不归类为上游故障
- **WHEN** 请求仅因并发满而进入等待队列
- **THEN** 日志中的原因与阶段 MUST 反映容量约束语义
- **AND** MUST NOT 归类为网络或服务故障

#### Scenario: 等待超时不归类为上游故障
- **WHEN** 请求在等待队列中超时
- **THEN** 日志 MUST 将该结果标记为等待超时
- **AND** MUST NOT 伪造上游失败证据

#### Scenario: 等待中断不归类为上游故障
- **WHEN** 客户端在等待期间断开连接
- **THEN** 日志 MUST 将该结果标记为网关侧中断
- **AND** MUST NOT 将该请求记为已发送到上游

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

### Requirement: 下游取消与流式中断必须写入可解释终态
系统 MUST 在下游取消、客户端断开或流式传输中断时，将对应 request log 收口为明确终态，并保留足够的阶段语义供管理端解释。

#### Scenario: 发往上游前断开也必须收口
- **WHEN** 调用方在请求尚未真正发送到上游前断开连接
- **THEN** 对应日志 SHALL 收口为终态
- **AND** 日志中的上游发送语义 MUST 反映该请求未真正发往上游

#### Scenario: 流式传输中途断开必须标记为下游中断
- **WHEN** 调用方在流式响应已经开始后中途取消、断开或停止接收
- **THEN** 对应日志 SHALL 在同一次请求生命周期内收口为终态
- **AND** 失败阶段 MUST 标识为下游流式中断语义，而不是普通上游故障

### Requirement: 生命周期展示不得把已取消请求继续显示为请求中
系统 MUST 确保管理端生命周期展示与日志终态语义一致，避免已取消或已中断请求继续显示为“请求中”。

#### Scenario: 已取消请求展示为终态
- **WHEN** 某条请求已经因为客户端断开而收口
- **THEN** 管理端生命周期状态 SHALL 展示为终态
- **AND** 不得继续映射为 `requesting` 或其他进行中状态

### Requirement: 队列等待生命周期必须结构化记录
系统 SHALL 在路由决策日志中结构化记录队列等待生命周期，以支持定位请求何时开始等待、等待了多久，以及为何结束等待。

#### Scenario: 请求进入等待队列
- **WHEN** 请求因所有即时候选都满载而进入等待队列
- **THEN** `routingDecision.queue` MUST 记录状态为 `waiting`
- **AND** MUST 记录进入等待时间、目标上游和队列超时配置

#### Scenario: 请求恢复执行
- **WHEN** 等待中的请求获得执行资格并继续进入代理转发
- **THEN** `routingDecision.queue` MUST 记录状态为 `resumed`
- **AND** MUST 记录恢复时间、等待时长和最终命中的上游

#### Scenario: 请求等待超时
- **WHEN** 请求在等待队列中超过配置超时时间
- **THEN** `routingDecision.queue` MUST 记录状态为 `timed_out`
- **AND** 该结果 MUST 与上游请求超时区分

#### Scenario: 请求等待期间客户端断开
- **WHEN** 客户端在请求仍处于等待队列期间断开
- **THEN** `routingDecision.queue` MUST 记录状态为 `aborted`
- **AND** 日志 MUST 明确该请求未被发送到上游

