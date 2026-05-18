## ADDED Requirements

### Requirement: 请求日志展开行必须显示对应的请求录制
系统 MUST 在请求日志展开行内显示该日志对应的录制元信息与完整 fixture 内容，使管理员可以在不离开日志页的前提下查看请求与响应正文。

#### Scenario: 已录制的日志展开
- **WHEN** 管理员展开某条日志行
- **AND** 该日志存在对应的请求录制
- **THEN** 展开区 SHALL 显示录制元信息（状态码、模型、文件大小、脱敏标记、创建时间）
- **AND** 展开区 SHALL 渲染录制 fixture 的 JSON 树
- **AND** 展开区 SHALL 提供「在录制页打开」入口，导航到对应录制详情

#### Scenario: 未录制的日志展开
- **WHEN** 管理员展开某条日志行
- **AND** 该日志没有对应的请求录制
- **THEN** 展开区 SHALL 显示「该请求未被录制」状态
- **AND** 展开区 SHALL 提供「打开录制管理」次要入口

#### Scenario: 录制文件缺失
- **WHEN** 管理员展开某条日志行
- **AND** 该日志的录制索引存在但 fixture 文件无法读取
- **THEN** 展开区 SHALL 显示可解释的文件缺失错误
- **AND** 展开区 SHALL 提供前往录制页清理失效索引的入口

#### Scenario: 录制查询失败
- **WHEN** 管理员展开某条日志行
- **AND** 录制探测或详情请求返回错误
- **THEN** 展开区 SHALL 显示错误状态
- **AND** 错误状态 SHALL 不阻塞日志展开行的其他内容（路由决策、failover 详情等）

### Requirement: 日志展开行的录制查询必须按需触发
系统 MUST 仅在管理员展开某条日志时才发起对应的录制查询，避免日志列表本身加载多余数据。

#### Scenario: 折叠状态下不查询
- **WHEN** 日志列表渲染完成且没有任何行被展开
- **THEN** 系统 SHALL 不发起录制查询

#### Scenario: 展开后触发查询
- **WHEN** 管理员展开某条日志行
- **THEN** 系统 SHALL 按该日志 ID 触发一次录制探测查询
- **AND** 探测命中后 SHALL 触发一次录制详情查询

### Requirement: 请求录制行必须能反向跳转到原始请求日志
系统 MUST 在请求录制管理页的列表行内为存在 `request_log_id` 的记录提供回跳入口，使管理员可以从录制定位到对应日志。

#### Scenario: 录制存在关联日志
- **WHEN** 管理员查看录制管理页表格
- **AND** 某条录制的 `request_log_id` 非空
- **THEN** 该行 SHALL 显示「打开原始日志」入口
- **AND** 入口 SHALL 链接到 `/logs?focus=<request_log_id>`

#### Scenario: 录制缺失关联日志
- **WHEN** 某条录制的 `request_log_id` 为空
- **THEN** 该行 SHALL 不显示回跳入口

### Requirement: 请求日志页必须支持按 ID 聚焦查询
系统 MUST 允许请求日志页通过 query 参数定位单条日志，并在进入时自动展开该日志的详情。

#### Scenario: 通过 focus 参数进入日志页
- **WHEN** 管理员访问 `/logs?focus=<id>` 且该 ID 对应的日志存在
- **THEN** 系统 SHALL 只列出该条日志
- **AND** 系统 SHALL 在初始渲染时把该日志放入已展开集合
- **AND** 页面顶部 SHALL 显示聚焦提示条与「清除聚焦」入口

#### Scenario: focus 参数命中失败
- **WHEN** 管理员访问 `/logs?focus=<id>` 但该 ID 对应的日志不存在
- **THEN** 系统 SHALL 显示「找不到该日志」提示
- **AND** 系统 SHALL 提供「清除聚焦」入口以回到普通列表

#### Scenario: 清除聚焦
- **WHEN** 管理员在聚焦模式下点击清除聚焦
- **THEN** 系统 SHALL 移除 `focus` query 参数
- **AND** 系统 SHALL 恢复默认的分页日志列表

### Requirement: 请求日志列表 API 必须支持按 ID 精确查询
系统 MUST 在 `/api/admin/logs` 列表接口上提供按日志 ID 精确过滤的能力。

#### Scenario: 提供有效的 id 参数
- **WHEN** 管理员请求 `GET /api/admin/logs?id=<existing-id>`
- **THEN** 接口 SHALL 只返回该条日志
- **AND** 响应分页字段 SHALL 反映过滤后的结果

#### Scenario: 提供不存在的 id 参数
- **WHEN** 管理员请求 `GET /api/admin/logs?id=<missing-id>`
- **THEN** 接口 SHALL 返回空 `items` 列表
- **AND** 响应分页字段 SHALL 显示总数为零

#### Scenario: 缺少管理员认证
- **WHEN** 请求缺少有效的管理员认证
- **THEN** 接口 SHALL 拒绝该请求
