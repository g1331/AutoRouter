## MODIFIED Requirements

### Requirement: 管理 API 客户端认证文件操作

系统 SHALL 在 CLIProxyAPI 管理 API 客户端中新增三个方法：上传认证文件、下载认证文件、删除认证文件。三个方法 MUST 复用现有的鉴权、超时和错误处理机制。

#### Scenario: 上传认证文件

- **WHEN** 调用上传认证文件方法，传入目标实例、合法文件名和 JSON 内容
- **THEN** 客户端向 CLIProxyAPI 发送 `POST /v0/management/auth-files?name=<URL 编码的文件名>`，请求体为原始 JSON 内容

#### Scenario: 下载认证文件

- **WHEN** 调用下载认证文件方法，传入目标实例和账号文件名
- **THEN** 客户端向 CLIProxyAPI 发送 `GET /v0/management/auth-files/download?name=<文件名>`，返回原始 JSON 文本

#### Scenario: 删除认证文件

- **WHEN** 调用删除认证文件方法，传入目标实例和账号文件名
- **THEN** 客户端向 CLIProxyAPI 发送 `DELETE /v0/management/auth-files`，请求体包含 `{ name: <文件名> }`

### Requirement: 认证文件管理 Admin API

系统 SHALL 提供认证文件管理 Admin API，包含上传、下载、删除三个端点。所有端点 MUST 复用既有 Admin 鉴权机制（Bearer ADMIN_TOKEN）。

#### Scenario: 上传认证文件

- **WHEN** 管理员向 `POST /api/admin/cliproxy/instances/:id/auth-files` 提交 JSON 内容
- **THEN** 系统读取可选的 `name` 查询参数；未提供时生成唯一 `.json` 文件名，随后将文件名和原始内容传至 CLIProxyAPI 上传端点，成功后触发该实例的账号同步并返回同步结果

#### Scenario: 下载认证文件

- **WHEN** 管理员请求 `GET /api/admin/cliproxy/instances/:id/auth-files/:name`
- **THEN** 系统从 CLIProxyAPI 下载该文件并以 `application/json` 返回原始内容

#### Scenario: 删除认证文件

- **WHEN** 管理员请求 `DELETE /api/admin/cliproxy/instances/:id/auth-files/:name`
- **THEN** 系统调用删除服务方法，成功后返回已删除的文件名

#### Scenario: 非法上传文件名

- **WHEN** 上传请求显式提供空白文件名、路径分隔符、控制字符、冒号或非 `.json` 扩展名
- **THEN** 系统 MUST 返回 400，且不调用上游

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
- **THEN** 系统调用上传 API；选择文件时 SHALL 传递原文件名，粘贴时不复用先前选中文件的文件名，由服务端生成唯一文件名；成功后刷新账号列表并提示成功

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
