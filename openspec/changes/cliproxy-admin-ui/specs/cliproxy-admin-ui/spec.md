## ADDED Requirements

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

系统 SHALL 提供 OAuth 登录流程界面，以弹窗形式发起 Codex、Claude、Gemini 的 OAuth 登录。弹窗 MUST 展示授权地址、device code 与过期倒计时，并提供在新标签页打开授权地址、复制授权地址、复制 device code 的操作。系统 SHALL 按固定间隔轮询登录状态，并以接口返回的过期时间为轮询的硬性截止。登录成功时 MUST 关闭弹窗并刷新账号列表；过期或失败时 MUST 停止轮询并展示可理解的错误与重新发起入口。

#### Scenario: 发起 OAuth 登录

- **WHEN** 管理员为某实例发起某服务商的 OAuth 登录
- **THEN** 弹窗展示授权地址、device code 与过期倒计时，并开始轮询登录状态

#### Scenario: 登录成功

- **WHEN** 轮询到登录完成
- **THEN** 弹窗关闭，账号列表刷新，界面提示登录成功

#### Scenario: 登录过期

- **WHEN** 轮询达到接口返回的过期时间仍未完成
- **THEN** 停止轮询，展示过期错误与重新发起登录的入口

#### Scenario: 关闭弹窗停止轮询

- **WHEN** 管理员在登录完成前主动关闭弹窗
- **THEN** 轮询停止

### Requirement: CLI OAuth 上游创建入口

系统 SHALL 在实例行操作中提供按服务商一键创建池上游的入口，在账号行操作中提供将单个账号固定映射为上游的入口。两类创建操作 MUST 经确认后执行，成功后 MUST 提示成功。

#### Scenario: 一键创建池上游

- **WHEN** 管理员在某实例行选择创建某服务商的池上游并确认
- **THEN** 系统调用池上游创建 API，成功后提示成功

#### Scenario: 单账号映射上游

- **WHEN** 管理员在某账号行选择映射为上游并确认
- **THEN** 系统调用单账号上游创建 API，成功后提示成功
