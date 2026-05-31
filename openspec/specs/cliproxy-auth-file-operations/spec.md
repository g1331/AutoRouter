# cliproxy-auth-file-operations Specification

## Purpose
TBD - created by archiving change enhance-cliproxy-management. Update Purpose after archive.
## Requirements
### Requirement: 管理 API 客户端认证文件操作

系统 SHALL 在 CLIProxyAPI 管理 API 客户端中新增三个方法：上传认证文件、下载认证文件、删除认证文件。三个方法 MUST 复用现有的鉴权、超时和错误处理机制。

#### Scenario: 上传认证文件

- **WHEN** 调用上传认证文件方法，传入目标实例和 JSON 内容
- **THEN** 客户端向 CLIProxyAPI 发送 `POST /v0/management/auth-files`，请求体为 JSON 内容

#### Scenario: 下载认证文件

- **WHEN** 调用下载认证文件方法，传入目标实例和账号文件名
- **THEN** 客户端向 CLIProxyAPI 发送 `GET /v0/management/auth-files/download?name=<文件名>`，返回原始 JSON 文本

#### Scenario: 删除认证文件

- **WHEN** 调用删除认证文件方法，传入目标实例和账号文件名
- **THEN** 客户端向 CLIProxyAPI 发送 `DELETE /v0/management/auth-files`，请求体包含 `{ name: <文件名> }`

### Requirement: 认证文件删除服务

系统 SHALL 提供认证文件删除服务方法，先调用 CLIProxyAPI 删除上游文件，成功后删除本地 `cliproxy_auth_accounts` 缓存表中对应的记录。CLIProxyAPI 侧删除失败时 MUST 整体失败，MUST NOT 触及本地缓存。

#### Scenario: 删除成功并清理缓存

- **WHEN** 管理员请求删除某实例下的某个认证文件
- **THEN** 系统先调用 CLIProxyAPI 删除该文件，成功后从本地缓存表中移除对应记录

#### Scenario: CLIProxyAPI 删除失败

- **WHEN** CLIProxyAPI 删除认证文件请求返回错误
- **THEN** 系统返回错误，本地缓存保持不变

#### Scenario: 本地无缓存记录

- **WHEN** CLIProxyAPI 删除成功，但本地缓存表中无对应记录
- **THEN** 系统正常返回成功，不报错

### Requirement: 认证文件管理 Admin API

系统 SHALL 提供认证文件管理 Admin API，包含上传、下载、删除三个端点。所有端点 MUST 复用既有 Admin 鉴权机制（Bearer ADMIN_TOKEN）。

#### Scenario: 上传认证文件

- **WHEN** 管理员向 `POST /api/admin/cliproxy/instances/:id/auth-files` 提交 JSON 内容
- **THEN** 系统将内容透传至 CLIProxyAPI 上传端点，成功后触发该实例的账号同步并返回同步结果

#### Scenario: 下载认证文件

- **WHEN** 管理员请求 `GET /api/admin/cliproxy/instances/:id/auth-files/:name`
- **THEN** 系统从 CLIProxyAPI 下载该文件并以 `application/json` 返回原始内容

#### Scenario: 删除认证文件

- **WHEN** 管理员请求 `DELETE /api/admin/cliproxy/instances/:id/auth-files/:name`
- **THEN** 系统调用删除服务方法，成功后返回已删除的文件名

#### Scenario: 操作不存在的实例

- **WHEN** 请求指向不存在的实例 ID
- **THEN** 系统返回 404 实例不存在错误

#### Scenario: 缺少管理鉴权

- **WHEN** 请求未携带有效的 ADMIN_TOKEN Bearer 凭据
- **THEN** 系统返回 401 鉴权失败错误

### Requirement: 认证文件管理前端

系统 SHALL 在账号面板中提供认证文件上传按钮，点击后打开上传弹窗。上传弹窗 MUST 接受 JSON 文件选择或 JSON 文本粘贴。系统 SHALL 在账号行操作菜单中提供下载和删除操作。下载 MUST 触发浏览器文件下载。删除 MUST 经确认弹窗确认后执行。

#### Scenario: 上传认证文件

- **WHEN** 管理员在上传弹窗中选择 JSON 文件或粘贴 JSON 文本并提交
- **THEN** 系统调用上传 API，成功后刷新账号列表并提示成功

#### Scenario: 上传无效 JSON

- **WHEN** 管理员提交的内容不是合法 JSON
- **THEN** 前端阻止提交并提示格式错误

#### Scenario: 下载认证文件

- **WHEN** 管理员在某账号行选择下载
- **THEN** 浏览器下载该账号的原始 JSON 文件，文件名为账号文件名

#### Scenario: 删除认证文件

- **WHEN** 管理员在某账号行选择删除并在确认弹窗中确认
- **THEN** 系统调用删除 API，成功后刷新账号列表并提示成功

#### Scenario: 取消删除

- **WHEN** 管理员在确认弹窗中取消
- **THEN** 不执行删除操作

