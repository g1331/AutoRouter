# cliproxy-admin-ui Specification

## Purpose
TBD - created by archiving change cliproxy-admin-ui. Update Purpose after archive.
## Requirements
### Requirement: CLIProxyAPI 菜单入口与页面路由

系统 SHALL 在管理端左侧菜单的系统分组新增 CLIProxyAPI 入口，并新增页面路由 `(dashboard)/system/cliproxy`。菜单项 MUST 复用既有系统导航的定义方式，标签 MUST 取自国际化文案。

#### Scenario: 菜单可见且可导航

- **WHEN** 管理员查看左侧菜单的系统分组
- **THEN** 出现 CLIProxyAPI 入口，点击后进入 CLIProxyAPI 管理页面

#### Scenario: 菜单标签随语言切换

- **WHEN** 管理员切换界面语言
- **THEN** CLIProxyAPI 菜单标签以对应语言展示

### Requirement: 实例管理界面

系统 SHALL 提供 CLIProxyAPI 实例管理界面，覆盖实例列表展示、创建、编辑、删除。创建实例的表单 MUST 包含名称、运行模式、代理基础地址、管理 API 地址、客户端 API Key、管理 API 密钥字段，敏感凭据字段 MUST 以掩码输入呈现。界面 SHALL 提供创建前的连通性预检测与已保存实例的连通性检测，检测结果 MUST 以可理解的成功或失败信息呈现。

#### Scenario: 创建实例

- **WHEN** 管理员填写实例表单并提交
- **THEN** 系统调用创建实例 API，成功后刷新实例列表并提示成功

#### Scenario: 创建前预检测

- **WHEN** 管理员在创建实例前触发连通性预检测
- **THEN** 系统以填写的管理地址与密钥调用预检测 API，并展示检测结果

#### Scenario: 编辑与删除实例

- **WHEN** 管理员对某个实例执行编辑或删除
- **THEN** 系统调用对应 API，成功后刷新实例列表

#### Scenario: 删除受引用实例被拒绝

- **WHEN** 管理员删除一个仍被账号或上游引用的实例
- **THEN** 界面展示后端返回的拒绝原因，实例未被删除

### Requirement: OAuth 账号管理界面

系统 SHALL 在选中实例后于同页面展示该实例的 OAuth 账号列表，每个账号 MUST 展示账号文件名、服务商、状态、模型数量与前缀。界面 SHALL 提供账号同步操作，从 CLIProxyAPI 拉取最新账号。界面 SHALL 提供账号启停操作，以及前缀、出站代理、优先级、备注的编辑。

#### Scenario: 查看实例的账号列表

- **WHEN** 管理员在实例列表中选中一个实例
- **THEN** 页面展示该实例的 OAuth 账号列表及各账号的状态与模型数量

#### Scenario: 同步账号

- **WHEN** 管理员触发账号同步
- **THEN** 系统调用同步 API，成功后刷新账号列表

#### Scenario: 启停账号

- **WHEN** 管理员切换某个账号的启用状态
- **THEN** 系统调用账号状态 API，成功后账号状态更新

#### Scenario: 编辑账号字段

- **WHEN** 管理员修改某个账号的前缀、出站代理、优先级或备注并提交
- **THEN** 系统调用账号字段更新 API，成功后刷新账号列表

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

### Requirement: CLI OAuth 上游创建入口

系统 SHALL 在实例行操作中提供按服务商一键创建池上游的入口，在账号行操作中提供将单个账号固定映射为上游的入口。两类创建操作 MUST 经确认后执行，成功后 MUST 提示成功。

#### Scenario: 一键创建池上游

- **WHEN** 管理员在某实例行选择创建某服务商的池上游并确认
- **THEN** 系统调用池上游创建 API，成功后提示成功

#### Scenario: 单账号映射上游

- **WHEN** 管理员在某账号行选择映射为上游并确认
- **THEN** 系统调用单账号上游创建 API，成功后提示成功

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

