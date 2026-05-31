## ADDED Requirements

### Requirement: 账号模型列表查看

系统 SHALL 在前端账号表格中提供每个账号的模型列表查看入口。点击后 MUST 调用后端 API 获取该账号在 CLIProxyAPI 侧的可用模型列表，并以弹窗或展开行形式展示。模型列表 MUST 展示模型 ID 和显示名称。

#### Scenario: 查看账号模型列表

- **WHEN** 管理员点击某账号的模型数量或模型查看操作
- **THEN** 系统从 CLIProxyAPI 实时查询该账号的可用模型列表并展示

#### Scenario: 模型查询失败

- **WHEN** 模型列表查询调用 CLIProxyAPI 失败
- **THEN** 弹窗展示可理解的错误信息

#### Scenario: 账号无可用模型

- **WHEN** CLIProxyAPI 返回空模型列表
- **THEN** 弹窗展示"该账号暂无可用模型"提示

### Requirement: 账号模型列表 Admin API

系统 SHALL 提供账号模型列表查询 Admin API `GET /api/admin/cliproxy/instances/:id/auth-accounts/:name/models`。该端点 MUST 复用既有 Admin 鉴权机制。端点 SHALL 调用 CLIProxyAPI 管理 API 客户端的 `getAuthFileModels` 方法查询指定账号的模型列表。

#### Scenario: 查询账号模型列表

- **WHEN** 管理员请求某实例下某账号的模型列表
- **THEN** 系统从 CLIProxyAPI 查询并返回该账号的可用模型数组

#### Scenario: CLIProxyAPI 查询失败

- **WHEN** CLIProxyAPI 模型查询端点返回错误
- **THEN** 系统返回对应的管理 API 错误

### Requirement: 账号详情查看

系统 SHALL 在前端账号表格的行操作菜单中提供详情查看入口。详情弹窗 MUST 展示账号的全部元数据：账号文件名、服务商、邮箱、CLIProxyAPI 侧状态（status 字段）、启用/停用状态、前缀、优先级、备注、模型数量、原始元数据快照（raw_metadata 中的各字段）、最近同步时间、创建时间、更新时间。

#### Scenario: 查看账号详情

- **WHEN** 管理员在某账号行选择查看详情
- **THEN** 弹窗展示该账号的全部元数据

#### Scenario: 元数据字段为空

- **WHEN** 某些可选字段（email、status、prefix、note 等）为空
- **THEN** 弹窗中对应位置展示占位符或"未设置"标记

### Requirement: 账号表格信息增强

系统 SHALL 在账号表格中增加 email 列的展示。email 列 MUST 展示账号的邮箱地址，为空时显示占位符。

#### Scenario: 展示账号邮箱

- **WHEN** 账号存在邮箱地址
- **THEN** 表格中 email 列展示该邮箱

#### Scenario: 邮箱为空

- **WHEN** 账号邮箱为空
- **THEN** 表格中 email 列展示"—"占位符

## MODIFIED Requirements

### Requirement: CLIProxyAPI 管理 API 客户端

系统 SHALL 提供单一的 CLIProxyAPI 管理 API 客户端模块，集中封装本能力所需的全部管理端点调用。客户端 MUST 使用 `Authorization: Bearer` 形式注入管理密钥，MUST 为请求设置超时上限，并 MUST 对响应缺失字段做容错解析。封装范围 SHALL 覆盖列出 auth-files、查询某 auth-file 的模型、更新账号启用状态、更新账号字段、获取 OAuth 授权地址、查询 OAuth 登录状态、上传认证文件、下载认证文件、删除认证文件、提交 OAuth 回调、查询实例日志。

#### Scenario: 携带管理密钥调用管理 API

- **WHEN** 客户端调用任一管理端点
- **THEN** 请求头以 `Authorization: Bearer` 形式携带该实例的管理密钥明文

#### Scenario: 管理 API 调用超时

- **WHEN** 某次管理 API 调用在超时上限内未返回
- **THEN** 客户端中止请求并返回可识别的超时错误

#### Scenario: 响应字段缺失容错

- **WHEN** CLIProxyAPI 返回的 auth-files 条目缺少部分可选字段
- **THEN** 客户端按缺省值解析，不因可选字段缺失而抛出异常

### Requirement: OAuth 登录流程

系统 SHALL 允许管理员从管理端发起 Codex、Claude、Gemini、xAI、Antigravity、Kimi 的 OAuth 登录。发起登录时系统 MUST 调用 CLIProxyAPI 对应的授权地址端点并默认携带 `is_webui=true`，将返回的授权地址与会话标识返回管理端。系统 SHALL 提供登录状态查询，透传 CLIProxyAPI 的登录状态。当登录状态为成功时，系统 MUST 触发该实例的账号同步。系统 MUST NOT 在自身持久化 OAuth 登录会话。

#### Scenario: 发起 OAuth 登录

- **WHEN** 管理员对某实例选择服务商并发起 OAuth 登录
- **THEN** 系统返回 CLIProxyAPI 给出的授权地址与会话标识

#### Scenario: 轮询登录进行中

- **WHEN** 管理员持会话标识查询登录状态且 CLIProxyAPI 返回进行中
- **THEN** 系统返回进行中状态，供管理端继续轮询

#### Scenario: 登录成功触发同步

- **WHEN** 登录状态查询返回成功
- **THEN** 系统触发该实例的账号同步，使新登录账号进入缓存表

#### Scenario: 登录失败返回错误

- **WHEN** CLIProxyAPI 返回登录失败
- **THEN** 系统返回失败状态与错误信息

#### Scenario: 六个 Provider 均可发起

- **WHEN** 管理员选择 xAI、Antigravity 或 Kimi 发起登录
- **THEN** 系统使用对应的授权地址端点发起登录，流程与既有三个 Provider 一致
