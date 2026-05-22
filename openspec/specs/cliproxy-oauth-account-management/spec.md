# cliproxy-oauth-account-management Specification

## Purpose
TBD - created by archiving change cliproxy-oauth-account-management. Update Purpose after archive.
## Requirements
### Requirement: CLIProxyAPI 管理 API 客户端

系统 SHALL 提供单一的 CLIProxyAPI 管理 API 客户端模块，集中封装本能力所需的全部管理端点调用。客户端 MUST 使用 `Authorization: Bearer` 形式注入管理密钥，MUST 为请求设置超时上限，并 MUST 对响应缺失字段做容错解析。封装范围 SHALL 覆盖列出 auth-files、查询某 auth-file 的模型、更新账号启用状态、更新账号字段、获取 OAuth 授权地址、查询 OAuth 登录状态。

#### Scenario: 携带管理密钥调用管理 API

- **WHEN** 客户端调用任一管理端点
- **THEN** 请求头以 `Authorization: Bearer` 形式携带该实例的管理密钥明文

#### Scenario: 管理 API 调用超时

- **WHEN** 某次管理 API 调用在超时上限内未返回
- **THEN** 客户端中止请求并返回可识别的超时错误

#### Scenario: 响应字段缺失容错

- **WHEN** CLIProxyAPI 返回的 auth-files 条目缺少部分可选字段
- **THEN** 客户端按缺省值解析，不因可选字段缺失而抛出异常

### Requirement: OAuth 账号元数据缓存

系统 SHALL 提供 `cliproxy_auth_accounts` 表缓存 CLIProxyAPI auth-files 的非敏感元数据，字段包含所属实例、账号文件名、服务商、邮箱、状态、停用标记、前缀、模型数量、优先级、备注、非敏感原始快照与最近同步时间。系统 MUST NOT 将 OAuth token 明文、access token、refresh token、id_token 或 token 文件内容写入该表。该表 SHALL 在 PostgreSQL 与 SQLite 两套 schema 中以等价字段定义，并对 `(实例, 账号文件名)` 建立唯一约束。

#### Scenario: 双 schema 字段一致

- **WHEN** 对比 PostgreSQL 与 SQLite 两套 schema 中的 `cliproxy_auth_accounts` 表定义
- **THEN** 两者字段集合、字段语义与唯一约束一致

#### Scenario: 缓存不含 token 明文

- **WHEN** 账号元数据写入缓存表
- **THEN** 表中不存在 OAuth token、access token、refresh token、id_token 或 token 文件内容

### Requirement: OAuth 账号同步

系统 SHALL 提供账号同步能力，从 CLIProxyAPI 拉取 auth-files 并按 `(实例, 账号文件名)` 将非敏感元数据 upsert 到缓存表。同步 MUST 移除 CLIProxyAPI 侧已不存在、但本地仍缓存的账号条目。模型数量 SHALL 通过查询 auth-file 模型获取，单个账号模型查询失败时 MUST NOT 中断整体同步。同步 SHALL 支持管理员主动触发。

#### Scenario: 同步新增账号

- **WHEN** CLIProxyAPI 存在某个本地缓存中尚无的 auth-file
- **THEN** 同步后该账号以非敏感元数据出现在缓存表

#### Scenario: 同步移除失效账号

- **WHEN** 本地缓存存在某账号，但 CLIProxyAPI 的 auth-files 中已不存在
- **THEN** 同步后该账号从缓存表移除

#### Scenario: 单账号模型查询失败不中断同步

- **WHEN** 同步过程中某个账号的模型查询失败
- **THEN** 同步继续处理其余账号，该账号模型数量按缺省处理

### Requirement: OAuth 登录流程

系统 SHALL 允许管理员从管理端发起 Codex、Claude、Gemini 的 OAuth 登录。发起登录时系统 MUST 调用 CLIProxyAPI 对应的授权地址端点并默认携带 `is_webui=true`，将返回的授权地址与会话标识返回管理端。系统 SHALL 提供登录状态查询，透传 CLIProxyAPI 的登录状态。当登录状态为成功时，系统 MUST 触发该实例的账号同步。系统 MUST NOT 在自身持久化 OAuth 登录会话。

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

### Requirement: OAuth 账号启停与字段管理

系统 SHALL 允许管理员启停某个 OAuth 账号，以及设置账号的前缀、出站代理、优先级、备注。启停 MUST 调用 CLIProxyAPI 的账号状态端点，字段设置 MUST 调用 CLIProxyAPI 的账号字段端点。操作在 CLIProxyAPI 成功后，系统 SHALL 同步更新本地缓存表对应字段。

#### Scenario: 停用账号

- **WHEN** 管理员停用某个 OAuth 账号
- **THEN** 系统调用 CLIProxyAPI 将该账号置为停用，并更新本地缓存的停用标记

#### Scenario: 设置账号字段

- **WHEN** 管理员为某账号设置前缀、出站代理、优先级或备注
- **THEN** 系统调用 CLIProxyAPI 写入对应字段，并更新本地缓存

### Requirement: 实例删除引用保护

系统 SHALL 在删除 CLIProxyAPI 实例前检查该实例下是否仍存在缓存的 OAuth 账号。当存在缓存账号时，系统 MUST 拒绝删除并返回可理解的冲突错误。

#### Scenario: 存在账号时拒绝删除实例

- **WHEN** 管理员请求删除一个在缓存表中仍存在 OAuth 账号的实例
- **THEN** 系统拒绝删除并返回实例仍被引用的冲突错误

#### Scenario: 无账号时允许删除实例

- **WHEN** 管理员请求删除一个缓存表中没有任何 OAuth 账号的实例
- **THEN** 系统正常删除该实例

### Requirement: OAuth 账号管理 Admin API

系统 SHALL 提供 OAuth 账号管理相关的 Admin API，覆盖列出实例下账号、触发账号同步、更新账号字段、启停账号、发起 OAuth 登录、查询登录状态。所有端点 MUST 复用既有 Admin 鉴权机制，并对入参执行严格校验。

#### Scenario: 列出实例下账号

- **WHEN** 管理员请求某实例的 OAuth 账号列表
- **THEN** 系统返回该实例缓存表中的账号及其非敏感元数据

#### Scenario: 缺少管理鉴权

- **WHEN** 请求未携带有效的 `ADMIN_TOKEN` Bearer 凭据
- **THEN** 系统拒绝请求并返回鉴权失败错误

#### Scenario: 操作不存在的实例

- **WHEN** 管理员对一个不存在的实例发起账号同步或 OAuth 登录
- **THEN** 系统返回实例不存在错误

