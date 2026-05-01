## ADDED Requirements

### Requirement: CLI OAuth 管理入口
系统 SHALL 在管理端提供 CLI OAuth 管理入口，用于展示 CLIProxyAPI 服务连接、OAuth 账号列表、模型数量、登录入口、账号操作、出站代理配置和上游预设。该入口 MUST 与现有上游管理保持同一视觉层级，并明确区分 AutoRouter 到 CLIProxyAPI 的服务连接与 CLIProxyAPI 到 OAuth/模型服务的出站代理。

#### Scenario: 查看 CLIProxyAPI 服务状态
- **WHEN** 管理员打开 CLI OAuth 管理入口
- **THEN** 页面 MUST 展示 CLIProxyAPI 服务地址、management 地址、连接状态和最近一次测试结果
- **AND** 敏感凭据 MUST 只展示掩码或已配置状态

#### Scenario: 查看 OAuth 账号状态
- **WHEN** CLIProxyAPI 返回 OAuth 账号列表
- **THEN** 页面 MUST 按 provider 展示账号名称、启用状态、模型数量、冷却或错误状态和可用操作
- **AND** 空列表 MUST 展示发起 OAuth 登录的下一步动作

#### Scenario: 发起 OAuth 登录
- **WHEN** 管理员选择 Codex、Claude 或 Gemini 登录入口
- **THEN** 页面 MUST 展示授权 URL、device code 或状态标识、过期时间和轮询状态
- **AND** 登录完成后 MUST 刷新账号列表

#### Scenario: 配置出站代理
- **WHEN** 管理员编辑 CLIProxyAPI 出站代理地址
- **THEN** 页面 MUST 标明该地址用于 CLIProxyAPI 访问 OAuth 与模型 API
- **AND** 页面 MUST 提供代理连通性测试反馈

### Requirement: CLI OAuth 上游预设入口
系统 SHALL 在上游创建流程中提供 CLI OAuth 上游预设入口，并允许管理员在保存前检查和修改预填的 base URL、route capabilities、模型发现配置、模型规则、权重、优先级、并发和配额。

#### Scenario: 选择池上游预设
- **WHEN** 管理员在创建上游时选择 Codex、Claude 或 Gemini OAuth 池预设
- **THEN** 表单 MUST 自动填入对应名称、endpoint、能力集合和模型发现配置
- **AND** 表单 MUST 保持所有常规上游配置项可编辑

#### Scenario: 从账号创建固定账号上游
- **WHEN** 管理员从 CLI OAuth 账号列表选择创建固定账号上游
- **THEN** 系统 MUST 打开上游创建表单并填入账号 prefix 和模型规则初始值
- **AND** 管理员保存前 MUST 能查看最终请求地址和规则效果

#### Scenario: 预设保存失败
- **WHEN** 管理员保存 CLI OAuth 上游预设失败
- **THEN** 页面 MUST 在上游创建区域展示错误原因
- **AND** OAuth 账号列表和 CLIProxyAPI 连接状态不得被错误状态覆盖
