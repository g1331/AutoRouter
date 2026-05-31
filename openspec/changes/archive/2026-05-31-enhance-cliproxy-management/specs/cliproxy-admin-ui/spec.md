## ADDED Requirements

### Requirement: 实例行内启停切换

系统 SHALL 在实例表格的状态列中以 Switch 组件替代原有的纯 Badge 展示，允许管理员直接在行内切换实例的启用/停用状态。切换 MUST 调用实例更新 API 仅修改 `enabled` 字段，成功后刷新实例列表并提示成功，失败时回滚 Switch 状态并提示错误。

#### Scenario: 启用实例

- **WHEN** 管理员将某停用实例的 Switch 切换为启用
- **THEN** 系统调用实例更新 API 将 enabled 设为 true，成功后实例状态更新

#### Scenario: 停用实例

- **WHEN** 管理员将某启用实例的 Switch 切换为停用
- **THEN** 系统调用实例更新 API 将 enabled 设为 false，成功后实例状态更新

#### Scenario: 切换失败回滚

- **WHEN** 实例更新 API 调用失败
- **THEN** Switch 组件回滚到切换前状态，界面提示错误

### Requirement: 关联上游面板

系统 SHALL 在选中 CLIProxyAPI 实例后展示关联上游面板，列出该实例下所有关联的池上游和单账号上游。面板数据 MUST 来源于 AutoRouter 本地 `upstreams` 表中 `cliproxyInstanceId` 匹配所选实例的记录。每行 MUST 展示上游名称、服务商、类型（池上游/单账号上游）和绑定的账号文件名（如有）。

#### Scenario: 展示关联上游

- **WHEN** 管理员选中某实例且该实例存在关联上游
- **THEN** 关联上游面板展示该实例下所有关联上游的列表

#### Scenario: 无关联上游

- **WHEN** 管理员选中某实例且该实例无关联上游
- **THEN** 面板展示"暂无关联上游"提示

#### Scenario: 区分上游类型

- **WHEN** 关联上游列表包含池上游和单账号上游
- **THEN** 列表以不同标签区分两种类型，单账号上游额外展示绑定的账号文件名

### Requirement: 关联上游查询 Admin API

系统 SHALL 提供关联上游查询 Admin API `GET /api/admin/cliproxy/instances/:id/linked-upstreams`。该端点 MUST 复用既有 Admin 鉴权机制。端点 SHALL 查询 `upstreams` 表中 `cliproxyInstanceId` 等于指定实例 ID 的记录，并返回上游名称、ID、服务商、类型和绑定的账号文件名。

#### Scenario: 查询关联上游

- **WHEN** 管理员请求某实例的关联上游列表
- **THEN** 系统返回该实例下所有关联上游的信息

#### Scenario: 实例无关联上游

- **WHEN** 请求的实例无关联上游
- **THEN** 系统返回空数组

## MODIFIED Requirements

### Requirement: OAuth 登录流程界面

系统 SHALL 提供 OAuth 登录流程界面，以弹窗形式发起 Codex、Claude、Gemini、xAI、Antigravity、Kimi 的 OAuth 登录。弹窗 MUST 展示发起登录接口返回的授权地址，并提供在新标签页打开授权地址与复制授权地址的操作。系统 SHALL 按固定间隔轮询登录状态。由于发起登录接口不返回过期时间，系统 MUST 以客户端固定超时上限作为轮询的硬性截止。登录成功时 MUST 关闭弹窗并刷新账号列表；失败或达到超时上限时 MUST 停止轮询并展示可理解的错误、重新发起入口以及手动提交回调 URL 的入口。

#### Scenario: 发起 OAuth 登录

- **WHEN** 管理员为某实例发起某服务商的 OAuth 登录
- **THEN** 弹窗展示授权地址，并开始轮询登录状态

#### Scenario: 登录成功

- **WHEN** 轮询到登录完成
- **THEN** 弹窗关闭，账号列表刷新，界面提示登录成功

#### Scenario: 登录超时

- **WHEN** 轮询达到客户端固定超时上限仍未完成
- **THEN** 停止轮询，展示超时错误、重新发起登录的入口以及手动提交回调 URL 的输入区域

#### Scenario: 关闭弹窗停止轮询

- **WHEN** 管理员在登录完成前主动关闭弹窗
- **THEN** 轮询停止

#### Scenario: 服务商选项覆盖六个 Provider

- **WHEN** 管理员打开 OAuth 登录弹窗的服务商选择器
- **THEN** 列出 Codex、Claude、Gemini、xAI、Antigravity、Kimi 六个选项
