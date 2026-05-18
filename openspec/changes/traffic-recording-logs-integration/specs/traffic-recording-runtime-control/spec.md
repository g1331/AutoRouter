## MODIFIED Requirements

### Requirement: 管理员必须能查询和查看请求录制记录
系统 MUST 提供录制记录查询和详情读取能力，支持管理员按常用条件查找录制记录并查看对应 fixture 内容。

#### Scenario: 分页查询录制记录
- **WHEN** 管理员请求录制记录列表
- **THEN** 系统 SHALL 返回按创建时间倒序排列的分页结果
- **AND** 响应 SHALL 包含总数、当前页和总页数

#### Scenario: 按条件筛选录制记录
- **WHEN** 管理员提供时间范围、状态码、模型、API key、上游或请求日志 ID 筛选条件
- **THEN** 系统 SHALL 只返回匹配条件的录制记录

#### Scenario: 按请求日志 ID 精确反查
- **WHEN** 管理员通过 `request_log_id` 参数请求录制列表
- **AND** 该日志存在对应的录制记录
- **THEN** 系统 SHALL 返回与该日志关联的录制记录
- **WHEN** 该日志不存在对应的录制记录
- **THEN** 系统 SHALL 返回空结果

#### Scenario: 读取录制详情
- **WHEN** 管理员请求某条录制记录详情
- **THEN** 系统 SHALL 返回录制索引元信息和 fixture 内容

#### Scenario: 录制文件缺失
- **WHEN** 录制索引存在但对应 fixture 文件无法读取
- **THEN** 详情接口 SHALL 返回可解释的文件缺失错误
