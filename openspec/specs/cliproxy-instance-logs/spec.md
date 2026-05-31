# cliproxy-instance-logs Specification

## Purpose
TBD - created by archiving change enhance-cliproxy-management. Update Purpose after archive.
## Requirements
### Requirement: 管理 API 客户端日志查询

系统 SHALL 在 CLIProxyAPI 管理 API 客户端中新增日志查询方法。该方法 MUST 调用 `GET /v0/management/logs`，支持可选的时间戳参数用于增量拉取。响应 MUST 解析为日志条目数组。

#### Scenario: 查询全部日志

- **WHEN** 调用日志查询方法且不传入时间戳参数
- **THEN** 客户端向 CLIProxyAPI 发送不带时间戳过滤的日志查询请求

#### Scenario: 增量查询日志

- **WHEN** 调用日志查询方法并传入起始时间戳
- **THEN** 客户端在请求中携带时间戳参数，仅返回该时间点之后的日志

#### Scenario: CLIProxyAPI 不支持日志端点

- **WHEN** CLIProxyAPI 返回 404 或其他不支持的状态
- **THEN** 客户端返回可识别的服务错误，不抛出未分类异常

### Requirement: 实例日志 Admin API

系统 SHALL 提供实例日志查询 Admin API `GET /api/admin/cliproxy/instances/:id/logs`。该端点 MUST 复用既有 Admin 鉴权机制。端点 SHALL 支持 `since` 查询参数（ISO 时间戳），将其透传至 CLIProxyAPI 日志查询端点。

#### Scenario: 查询实例日志

- **WHEN** 管理员请求某实例的日志
- **THEN** 系统从 CLIProxyAPI 拉取日志并返回日志条目数组

#### Scenario: 带时间范围查询

- **WHEN** 管理员在请求中携带 `since` 时间戳
- **THEN** 系统仅返回该时间点之后的日志

#### Scenario: 操作不存在的实例

- **WHEN** 请求指向不存在的实例 ID
- **THEN** 系统返回 404 实例不存在错误

### Requirement: 实例日志查看前端

系统 SHALL 在 CLIProxyAPI 页面选中实例后展示日志面板 Card。日志面板 MUST 以等宽字体渲染日志文本。面板 SHALL 提供手动刷新按钮和关键词搜索输入框（前端过滤）。面板 SHALL 在首次显示时自动拉取一次日志。

#### Scenario: 查看实例日志

- **WHEN** 管理员选中某实例
- **THEN** 日志面板自动拉取并展示该实例的最新日志

#### Scenario: 手动刷新

- **WHEN** 管理员点击刷新按钮
- **THEN** 面板重新拉取日志并更新显示

#### Scenario: 关键词搜索

- **WHEN** 管理员在搜索框中输入关键词
- **THEN** 日志列表仅显示包含该关键词的行

#### Scenario: 日志为空

- **WHEN** CLIProxyAPI 返回空日志
- **THEN** 面板展示"暂无日志"提示

#### Scenario: 切换实例

- **WHEN** 管理员切换到另一个实例
- **THEN** 日志面板清空并拉取新实例的日志

