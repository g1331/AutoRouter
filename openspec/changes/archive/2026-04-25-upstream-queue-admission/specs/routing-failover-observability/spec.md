## ADDED Requirements

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

## MODIFIED Requirements

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
