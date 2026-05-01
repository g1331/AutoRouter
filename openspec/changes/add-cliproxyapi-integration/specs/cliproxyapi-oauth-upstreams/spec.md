## ADDED Requirements

### Requirement: CLIProxyAPI 连接配置
系统 SHALL 支持配置 CLIProxyAPI 服务连接，并区分外部服务模式与受管 sidecar 模式。连接配置 MUST 包含服务 base URL、client API key、management URL、management secret、运行模式和可选出站代理配置。敏感字段 MUST 加密保存，管理端响应 MUST 仅返回掩码或存在状态。

#### Scenario: 保存外部 CLIProxyAPI 连接
- **WHEN** 管理员提交外部 CLIProxyAPI 服务地址、client API key、management URL 和 management secret
- **THEN** 系统 MUST 保存连接配置，并加密保存 client API key 与 management secret
- **AND** 后续读取配置时不得返回敏感字段明文

#### Scenario: 区分服务地址与出站代理地址
- **WHEN** 管理员同时配置 CLIProxyAPI 服务地址和 OAuth 出站代理地址
- **THEN** 系统 MUST 将服务地址用于 AutoRouter 到 CLIProxyAPI 的调用
- **AND** 系统 MUST 将出站代理地址标记为 CLIProxyAPI 到 OAuth 与模型服务的网络配置

#### Scenario: 未配置 CLIProxyAPI 时保持现有行为
- **WHEN** 系统没有任何 CLIProxyAPI 连接配置
- **THEN** 普通 HTTP API Key 上游的创建、更新、测试和代理转发 MUST 保持原行为

### Requirement: CLIProxyAPI management API 封装
系统 SHALL 通过 AutoRouter 管理 API 调用 CLIProxyAPI management API，支持账号列表、账号模型列表、账号状态更新、账号字段更新、OAuth 登录 URL 获取、登录状态轮询和连接测试。外部服务错误 MUST 转换为管理端可理解的错误响应。

#### Scenario: 获取 OAuth 账号列表
- **WHEN** 管理员请求查看 CLIProxyAPI OAuth 账号
- **THEN** 系统 MUST 调用 CLIProxyAPI management API 获取账号列表
- **AND** 响应 MUST 包含 provider、账号名称、启用状态、模型数量、冷却或错误状态等运行信息

#### Scenario: 获取账号模型列表
- **WHEN** 管理员查看某个 OAuth 账号支持的模型
- **THEN** 系统 MUST 调用 CLIProxyAPI 的账号模型接口并返回模型列表
- **AND** 模型列表 MUST 标明所属账号或账号 prefix，便于创建固定账号路由规则

#### Scenario: 更新账号状态
- **WHEN** 管理员启用或停用 CLIProxyAPI OAuth 账号
- **THEN** 系统 MUST 调用 CLIProxyAPI management API 更新账号状态
- **AND** 更新完成后管理端 MUST 刷新账号列表状态

#### Scenario: 更新账号字段
- **WHEN** 管理员修改账号 prefix、优先级、代理、备注或其他 CLIProxyAPI 支持字段
- **THEN** 系统 MUST 将字段更新请求转发给 CLIProxyAPI management API
- **AND** 系统 MUST 在失败时保留本地界面中的原账号状态

### Requirement: OAuth 登录流程
系统 SHALL 支持从 AutoRouter 管理端发起 Codex、Claude 和 Gemini CLI OAuth 登录，并展示授权 URL、device code、过期时间和轮询状态。登录 token 文件 MUST 继续由 CLIProxyAPI auth-dir 持久化，AutoRouter 数据库不得保存 OAuth token 明文。

#### Scenario: 发起 Codex OAuth 登录
- **WHEN** 管理员在 CLI OAuth 管理入口触发 Codex 登录
- **THEN** 系统 MUST 调用 CLIProxyAPI Codex 登录 URL 接口
- **AND** 管理端 MUST 展示授权 URL、状态标识和过期时间

#### Scenario: 发起 Claude OAuth 登录
- **WHEN** 管理员在 CLI OAuth 管理入口触发 Claude 登录
- **THEN** 系统 MUST 调用 CLIProxyAPI Claude 登录 URL 接口
- **AND** 管理端 MUST 展示登录状态并允许轮询完成结果

#### Scenario: 发起 Gemini OAuth 登录
- **WHEN** 管理员在 CLI OAuth 管理入口触发 Gemini 登录
- **THEN** 系统 MUST 调用 CLIProxyAPI Gemini 登录 URL 接口
- **AND** 管理端 MUST 在登录完成后刷新 OAuth 账号列表

#### Scenario: 登录轮询失败
- **WHEN** CLIProxyAPI 返回登录过期、取消或失败状态
- **THEN** 管理端 MUST 展示明确失败原因
- **AND** 系统不得创建未完成登录的上游或账号引用

### Requirement: OAuth 池上游预设
系统 SHALL 提供 Codex OAuth、Claude OAuth 和 Gemini OAuth 池上游预设。预设 MUST 生成正确的 CLIProxyAPI proxy base URL、route capabilities、模型发现配置和上游默认名称，管理员保存后该上游 MUST 进入现有能力路由、模型规则、负载选择、日志和计费流程。

#### Scenario: 创建 Codex OAuth 池上游
- **WHEN** 管理员选择 Codex OAuth 池预设
- **THEN** 表单 MUST 预填 `http://cliproxyapi:8317/v1` 形态的 base URL
- **AND** 能力集合 MUST 包含 `codex_cli_responses` 和 `openai_responses`

#### Scenario: 创建 Claude OAuth 池上游
- **WHEN** 管理员选择 Claude OAuth 池预设
- **THEN** 表单 MUST 预填 `http://cliproxyapi:8317/api/provider/anthropic/v1` 形态的 base URL
- **AND** 能力集合 MUST 包含 `claude_code_messages` 和 `anthropic_messages`

#### Scenario: 创建 Gemini OAuth 池上游
- **WHEN** 管理员选择 Gemini OAuth 池预设
- **THEN** 表单 MUST 预填 `http://cliproxyapi:8317/api/provider/google` 形态的 base URL
- **AND** 能力集合 MUST 包含 `gemini_native_generate`

### Requirement: 固定账号上游
系统 SHALL 支持把 CLIProxyAPI 内的单个 OAuth 账号固定映射为 AutoRouter 上游。固定账号上游 MUST 通过 CLIProxyAPI 账号 prefix 与 AutoRouter 模型规则表达目标账号，并继续由 AutoRouter 管理上游授权、配额、日志和计费。

#### Scenario: 从账号创建固定上游
- **WHEN** 管理员从 CLIProxyAPI OAuth 账号列表选择某个账号创建固定上游
- **THEN** 系统 MUST 生成带账号 prefix 的上游配置和模型规则初始值
- **AND** 管理员保存后该上游 MUST 作为普通 AutoRouter upstream 参与路由

#### Scenario: 固定账号模型规则命中
- **WHEN** 客户端请求命中固定账号上游的模型规则
- **THEN** AutoRouter MUST 将请求转发到对应 CLIProxyAPI endpoint
- **AND** CLIProxyAPI MUST 使用该 prefix 对应的 OAuth 账号处理请求

### Requirement: 部署与本地测试支持
系统 SHALL 提供外部 CLIProxyAPI 与受管 sidecar 两种部署说明，并覆盖 auth-dir 持久化、config 持久化、management secret、client API key 和出站代理配置。本地测试文档 MUST 能指导管理员验证连接、OAuth 登录、池上游转发和固定账号路由。

#### Scenario: 外部 CLIProxyAPI 模式
- **WHEN** 管理员已经独立运行 CLIProxyAPI 服务
- **THEN** AutoRouter MUST 支持通过配置的 base URL 与 management URL 连接该服务
- **AND** 本地测试说明 MUST 覆盖连接测试和代理请求验证

#### Scenario: Docker Compose sidecar 模式
- **WHEN** 管理员使用 Docker Compose 部署 AutoRouter 与 CLIProxyAPI
- **THEN** 部署配置 MUST 为 CLIProxyAPI auth-dir 和 config 提供持久化挂载
- **AND** AutoRouter MUST 能通过容器网络访问 CLIProxyAPI proxy 与 management 地址
