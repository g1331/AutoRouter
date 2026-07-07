# upstream-failure-controls Specification

## Purpose
TBD - created by archiving change upstream-failure-controls. Update Purpose after archive.
## Requirements
### Requirement: 上游必须支持可配置的响应超时
系统 MUST 支持在每个上游的熔断配置中设置首字超时和流式响应空闲超时。未显式配置时，首字超时 SHALL 使用 30 秒，流式响应空闲超时 SHALL 使用 60 秒。

#### Scenario: 管理员配置响应超时
- **WHEN** 管理员创建或更新上游并提交 `circuit_breaker_config.first_byte_timeout` 与 `circuit_breaker_config.stream_idle_timeout`
- **THEN** 系统 SHALL 将配置转换为内部毫秒值保存
- **AND** 后续读取上游详情时 SHALL 以秒为单位回显这两个字段

#### Scenario: 未配置时使用默认响应超时
- **WHEN** 某上游的熔断配置未包含首字超时或流式响应空闲超时
- **THEN** 系统 SHALL 使用首字 30 秒和空闲 60 秒作为有效配置

### Requirement: 首字超时必须触发无感故障转移
系统 MUST 在流式响应首个有效输出事件到达前执行首字超时判定。首字超时发生时，系统 SHALL 将该上游视为一次失败，并在尚未向下游发送内容的前提下继续尝试其他可用上游。

#### Scenario: 首字前无有效输出
- **WHEN** 上游已经返回 SSE 响应头但在首字超时时间内没有发送有效输出事件
- **THEN** 系统 SHALL 取消该上游流
- **AND** failover history SHALL 记录失败类型为 `first_byte_timeout`
- **AND** 该失败 SHALL 按失败规则决定是否计入熔断

#### Scenario: 元数据事件不得解除首字等待
- **WHEN** 上游只发送角色、创建、进度、ping 等纯元数据 SSE 事件
- **THEN** 系统 SHALL 继续等待首个有效输出事件
- **AND** 不得将这些元数据事件记录为 TTFT 或首字成功

### Requirement: 流式空闲超时必须收口正在输出的流
系统 MUST 在流式响应期间检测上游无数据空闲时间。已向下游发送内容后发生空闲超时时，系统 SHALL 结束当前流并记录失败，不得拼接另一个上游的输出。

#### Scenario: 响应期间长时间无数据
- **WHEN** 上游流式响应在空闲超时时间内没有产生任何 body chunk
- **THEN** 系统 SHALL 结束该流并向下游发送标准 SSE 错误事件
- **AND** 请求日志 SHALL 记录失败类型为 `stream_idle_timeout`
- **AND** 该失败 SHALL 按失败规则决定是否计入熔断

### Requirement: 失败规则必须支持全局与上游本地作用范围
系统 MUST 支持全局失败规则和上游本地失败规则。全局规则默认对所有上游生效；单个上游 MUST 能关闭全局规则并继续使用自身本地规则。

#### Scenario: 全局规则默认生效
- **WHEN** 某上游未显式关闭全局失败规则
- **THEN** 系统 SHALL 在判定失败是否计入熔断时同时检查启用的全局规则和该上游的本地规则

#### Scenario: 上游关闭全局规则
- **WHEN** 某上游配置为不使用全局失败规则
- **THEN** 系统 SHALL 只检查该上游启用的本地失败规则

#### Scenario: 管理员维护全局失败规则
- **WHEN** 管理员进入系统设置中的全局失败规则管理页面
- **THEN** 管理端 SHALL 展示全局失败规则列表
- **AND** 管理员 SHALL 能新增、启用、停用和删除全局失败规则
- **AND** 上游本地规则编辑 SHALL 继续保留在上游配置弹窗中

#### Scenario: 管理员编辑正则匹配条件
- **WHEN** 管理员在失败规则表单中填写响应体正则或响应头正则
- **THEN** 管理端 SHALL 在提交前校验正则表达式语法
- **AND** 正则表达式无效时 SHALL 禁止创建规则并展示错误反馈
- **AND** 管理端 SHALL 提供示例文本预览，展示当前正则是否能匹配示例内容

### Requirement: 失败规则命中后必须继续重试且不计入熔断
系统 MUST 在上游失败后对状态码、错误类型、响应头和响应体执行失败规则匹配。命中规则时，请求 SHALL 继续尝试其他可用上游，但该次失败不得增加熔断失败计数。

#### Scenario: 非成功响应命中忽略规则
- **WHEN** 上游返回非 2xx 响应且响应证据命中启用的失败规则
- **THEN** 系统 SHALL 继续尝试其他可用上游
- **AND** 系统 MUST NOT 调用该上游的熔断失败计数
- **AND** failover history MUST 记录命中的规则名称和该失败未计入熔断

#### Scenario: 超时失败未命中忽略规则
- **WHEN** 上游发生首字超时或流式空闲超时且未命中失败规则
- **THEN** 系统 SHALL 将该失败计入熔断
- **AND** failover history MUST 记录失败类型和计入熔断状态

