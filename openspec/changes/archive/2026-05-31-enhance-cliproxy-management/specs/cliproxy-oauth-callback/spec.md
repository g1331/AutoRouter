## ADDED Requirements

### Requirement: 管理 API 客户端 OAuth 回调提交

系统 SHALL 在 CLIProxyAPI 管理 API 客户端中新增 OAuth 回调 URL 提交方法。该方法 MUST 调用 `POST /v0/management/oauth-callback`，请求体包含 `provider` 和 `redirect_url` 字段。

#### Scenario: 提交回调 URL

- **WHEN** 调用 OAuth 回调提交方法，传入 Provider 和回调 URL
- **THEN** 客户端向 CLIProxyAPI 发送包含 provider 和 redirect_url 的 POST 请求

#### Scenario: CLIProxyAPI 返回错误

- **WHEN** CLIProxyAPI 拒绝回调 URL（例如格式错误或 state 过期）
- **THEN** 客户端返回可识别的服务错误

### Requirement: OAuth 回调 Admin API

系统 SHALL 提供 OAuth 回调提交 Admin API `POST /api/admin/cliproxy/instances/:id/oauth-callback`。请求体 MUST 包含 `provider` 和 `redirect_url` 字段。端点 SHALL 将回调透传至 CLIProxyAPI，成功后触发该实例的账号同步。

#### Scenario: 提交回调成功

- **WHEN** 管理员提交有效的回调 URL
- **THEN** 系统透传至 CLIProxyAPI，成功后触发账号同步并返回同步结果

#### Scenario: 缺少必填字段

- **WHEN** 请求体缺少 provider 或 redirect_url
- **THEN** 系统返回 400 参数校验错误

#### Scenario: 操作不存在的实例

- **WHEN** 请求指向不存在的实例 ID
- **THEN** 系统返回 404 实例不存在错误

### Requirement: OAuth 回调提交前端

系统 SHALL 在 OAuth 登录弹窗中提供手动提交回调 URL 的入口。当 OAuth 登录超时或失败时，弹窗 MUST 展示回调 URL 输入区域，允许管理员粘贴从浏览器地址栏获取的回调 URL。提交后 MUST 刷新账号列表。

#### Scenario: 超时后展示回调输入

- **WHEN** OAuth 登录轮询超时或返回错误
- **THEN** 弹窗展示回调 URL 输入框和提交按钮

#### Scenario: 手动提交回调成功

- **WHEN** 管理员粘贴回调 URL 并提交
- **THEN** 系统调用回调 API，成功后关闭弹窗、刷新账号列表并提示成功

#### Scenario: 提交空回调 URL

- **WHEN** 管理员未填写回调 URL 即提交
- **THEN** 前端阻止提交并提示必填
