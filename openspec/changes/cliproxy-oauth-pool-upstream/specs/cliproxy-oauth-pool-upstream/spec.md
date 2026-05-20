## ADDED Requirements

### Requirement: 上游与 CLIProxyAPI 关联建模

系统 SHALL 为 `upstreams` 表新增三个可空字段：所属 CLIProxyAPI 实例、绑定的 OAuth 账号文件名、CLI 服务商。三个字段 MUST 全部可空，既有普通上游这三个字段为空且行为不变。系统 SHALL 在 PostgreSQL 与 SQLite 两套 schema 中以等价字段定义。

#### Scenario: 双 schema 字段一致

- **WHEN** 对比 PostgreSQL 与 SQLite 两套 schema 中 `upstreams` 表的 CLIProxyAPI 关联字段
- **THEN** 两者字段集合与语义一致

#### Scenario: 既有普通上游不受影响

- **WHEN** 迁移应用到已存在普通上游的数据库
- **THEN** 既有上游的 CLIProxyAPI 关联字段为空，上游行为不变

### Requirement: OAuth 池上游一键创建

系统 SHALL 提供按服务商一键创建 OAuth 池上游的能力，支持 Codex、Claude、Gemini 三类服务商。池上游的代理地址 MUST 由实例代理地址拼接服务商专属路径得到，鉴权 MUST 使用实例的客户端 API Key，路由能力 MUST 按服务商预设。创建 SHALL 复用既有上游创建机制，使池上游自动获得名称唯一校验、能力校验与既有上游运行态能力。池上游 MUST 记录其所属 CLIProxyAPI 实例与服务商。

#### Scenario: 创建 Codex 池上游

- **WHEN** 管理员为某实例一键创建 Codex OAuth 池上游
- **THEN** 系统创建一个代理地址指向该实例 Codex 路径、路由能力为 Codex 能力预设的上游，并记录其所属实例与服务商

#### Scenario: 创建 Claude 池上游

- **WHEN** 管理员为某实例一键创建 Claude OAuth 池上游
- **THEN** 系统创建一个代理地址指向该实例 Anthropic 路径、路由能力为 Claude 能力预设的上游

#### Scenario: 创建 Gemini 池上游

- **WHEN** 管理员为某实例一键创建 Gemini OAuth 池上游
- **THEN** 系统创建一个代理地址指向该实例 Google 路径、路由能力为 Gemini 能力预设的上游

#### Scenario: 实例不存在时拒绝创建

- **WHEN** 管理员对一个不存在的实例创建池上游
- **THEN** 系统返回实例不存在错误

### Requirement: 单账号映射上游

系统 SHALL 提供将单个 OAuth 账号固定映射为一个 AutoRouter 上游的能力。映射 MUST 为目标账号确定一个账号前缀，账号尚无前缀时系统 SHALL 通过 CLIProxyAPI 为该账号写入前缀。系统 SHALL 以对应服务商的池上游配置为基础创建上游，记录其绑定的 OAuth 账号文件名，并写入模型规则使请求固定路由到该账号。

#### Scenario: 映射已有前缀的账号

- **WHEN** 管理员将一个已设置前缀的 OAuth 账号映射为上游
- **THEN** 系统沿用该账号已有前缀创建单账号上游，并写入携带该前缀的模型规则

#### Scenario: 映射无前缀的账号

- **WHEN** 管理员将一个尚无前缀的 OAuth 账号映射为上游
- **THEN** 系统为该账号通过 CLIProxyAPI 写入前缀，再创建单账号上游

#### Scenario: 单账号上游记录账号绑定

- **WHEN** 单账号映射上游创建完成
- **THEN** 该上游记录其所属实例、服务商与绑定的 OAuth 账号文件名

#### Scenario: 账号不存在时拒绝映射

- **WHEN** 管理员映射一个缓存表中不存在的 OAuth 账号
- **THEN** 系统返回账号不存在错误

### Requirement: 实例删除校验扩展至上游引用

系统 SHALL 在删除 CLIProxyAPI 实例时，除校验缓存 OAuth 账号引用外，同时校验 `upstreams` 表中是否存在关联该实例的上游。存在关联上游时系统 MUST 拒绝删除并返回冲突错误。

#### Scenario: 存在关联上游时拒绝删除实例

- **WHEN** 管理员请求删除一个仍有关联池上游或单账号上游的实例
- **THEN** 系统拒绝删除并返回实例仍被引用的冲突错误

#### Scenario: 无关联上游与账号时允许删除

- **WHEN** 管理员请求删除一个没有任何关联上游与缓存账号的实例
- **THEN** 系统正常删除该实例

### Requirement: OAuth 池上游与单账号映射 Admin API

系统 SHALL 提供创建 OAuth 池上游与单账号映射上游的 Admin API。所有端点 MUST 复用既有 Admin 鉴权机制，并对入参执行严格校验。创建成功时 SHALL 返回创建后的上游信息。

#### Scenario: 通过 API 创建池上游

- **WHEN** 管理员通过 Admin API 为某实例提交合法的服务商并创建池上游
- **THEN** 系统创建对应池上游并返回上游信息

#### Scenario: 通过 API 创建单账号映射上游

- **WHEN** 管理员通过 Admin API 将某账号映射为上游
- **THEN** 系统创建对应单账号上游并返回上游信息

#### Scenario: 缺少管理鉴权

- **WHEN** 请求未携带有效的 `ADMIN_TOKEN` Bearer 凭据
- **THEN** 系统拒绝请求并返回鉴权失败错误

#### Scenario: 提交非法服务商

- **WHEN** 创建池上游的请求携带不受支持的服务商
- **THEN** 系统返回参数校验错误并拒绝创建
