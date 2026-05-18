## ADDED Requirements

### Requirement: 请求录制配置必须可运行时管理
系统 MUST 提供受管理员认证保护的请求录制配置能力，使管理员可以在不重启服务的情况下启停录制、选择录制模式、配置脱敏策略和保留天数。

#### Scenario: 查询当前录制配置
- **WHEN** 管理员请求录制配置
- **THEN** 系统 SHALL 返回启用状态、录制模式、脱敏状态、保留天数和更新时间

#### Scenario: 更新录制配置
- **WHEN** 管理员更新录制配置
- **THEN** 系统 SHALL 持久化新的配置
- **AND** 后续新请求 SHALL 使用新的录制配置

#### Scenario: 缺少管理员认证
- **WHEN** 请求缺少有效管理员认证
- **THEN** 系统 SHALL 拒绝读取或修改录制配置

### Requirement: 请求录制必须使用文件正文和数据库索引
系统 MUST 继续将请求录制正文保存为 fixture 文件，并为每条录制记录保存数据库索引，用于列表查询、详情读取、占用统计和删除操作。

#### Scenario: 成功写入录制记录
- **WHEN** 某次代理请求满足当前录制配置
- **THEN** 系统 SHALL 写入 fixture 文件
- **AND** 系统 SHALL 创建包含文件路径、文件大小、请求日志 ID、模型、路径、状态码、脱敏状态和创建时间的录制索引

#### Scenario: 录制关闭
- **WHEN** 当前录制配置为关闭
- **THEN** 新的代理请求 SHALL 不读取请求体用于录制
- **AND** 系统 SHALL 不写入新的录制文件或录制索引

#### Scenario: 按录制模式过滤
- **WHEN** 当前录制模式为 `success`
- **THEN** 系统 SHALL 只录制成功请求
- **WHEN** 当前录制模式为 `failure`
- **THEN** 系统 SHALL 只录制失败请求
- **WHEN** 当前录制模式为 `all`
- **THEN** 系统 SHALL 录制成功和失败请求

### Requirement: 请求录制内容必须默认脱敏
系统 MUST 默认对录制内容中的敏感请求头、响应头和故障详情进行脱敏，并允许管理员显式关闭脱敏。

#### Scenario: 默认脱敏写入
- **WHEN** 管理员未修改脱敏配置
- **THEN** 系统 SHALL 在录制内容中隐藏认证头、Cookie 和会话相关敏感字段

#### Scenario: 管理员关闭脱敏
- **WHEN** 管理员将脱敏配置关闭
- **THEN** 后续新录制 SHALL 按配置保留原始内容
- **AND** 录制索引 SHALL 标记该记录未脱敏

### Requirement: 管理员必须能查询和查看请求录制记录
系统 MUST 提供录制记录查询和详情读取能力，支持管理员按常用条件查找录制记录并查看对应 fixture 内容。

#### Scenario: 分页查询录制记录
- **WHEN** 管理员请求录制记录列表
- **THEN** 系统 SHALL 返回按创建时间倒序排列的分页结果
- **AND** 响应 SHALL 包含总数、当前页和总页数

#### Scenario: 按条件筛选录制记录
- **WHEN** 管理员提供时间范围、状态码、模型、API key 或上游筛选条件
- **THEN** 系统 SHALL 只返回匹配条件的录制记录

#### Scenario: 读取录制详情
- **WHEN** 管理员请求某条录制记录详情
- **THEN** 系统 SHALL 返回录制索引元信息和 fixture 内容

#### Scenario: 录制文件缺失
- **WHEN** 录制索引存在但对应 fixture 文件无法读取
- **THEN** 详情接口 SHALL 返回可解释的文件缺失错误

### Requirement: 管理员必须能删除请求录制记录
系统 MUST 提供单条录制记录删除能力，同时清理数据库索引和对应 fixture 文件。

#### Scenario: 删除存在的录制记录
- **WHEN** 管理员删除某条录制记录
- **THEN** 系统 SHALL 删除对应 fixture 文件
- **AND** 系统 SHALL 删除数据库索引

#### Scenario: 删除文件已缺失的录制记录
- **WHEN** 管理员删除某条录制记录但对应文件已经不存在
- **THEN** 系统 SHALL 删除数据库索引
- **AND** 删除请求 SHALL 成功完成

### Requirement: 管理端必须提供请求录制管理页面
管理端 MUST 在系统设置区域提供请求录制管理页面，使管理员可以查看状态、修改配置、筛选记录、查看详情和删除记录。

#### Scenario: 从设置页进入请求录制页面
- **WHEN** 管理员打开系统设置页
- **THEN** 页面 SHALL 展示请求录制入口
- **AND** 入口 SHALL 导航到请求录制管理页面

#### Scenario: 查看录制状态与占用
- **WHEN** 管理员打开请求录制管理页面
- **THEN** 页面 SHALL 展示当前启用状态、录制模式、脱敏状态、保留天数、记录数量和磁盘占用

#### Scenario: 修改录制配置
- **WHEN** 管理员在页面中修改录制配置并保存
- **THEN** 页面 SHALL 调用配置更新 API
- **AND** 保存成功后 SHALL 刷新当前配置

#### Scenario: 查看和删除记录
- **WHEN** 管理员在录制记录列表中操作某条记录
- **THEN** 页面 SHALL 支持查看详情和删除该记录
