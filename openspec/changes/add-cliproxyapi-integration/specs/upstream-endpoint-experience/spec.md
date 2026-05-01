## ADDED Requirements

### Requirement: CLIProxyAPI 地址语义必须明确区分
系统 SHALL 在配置界面、连接测试和错误提示中明确区分 CLIProxyAPI proxy base URL、CLIProxyAPI management URL 和 OAuth 出站代理地址。系统 MUST 避免把出站代理地址用于 AutoRouter 到 CLIProxyAPI 的请求，也不得把 CLIProxyAPI 服务地址展示为 OAuth 服务地址。

#### Scenario: 展示 CLIProxyAPI proxy 地址预览
- **WHEN** 管理员选择 CLIProxyAPI 上游预设
- **THEN** 配置界面 MUST 展示该上游实际用于代理转发的 CLIProxyAPI proxy base URL
- **AND** 预览 MUST 与保存后代理请求使用的 base URL 语义一致

#### Scenario: 展示 management 地址说明
- **WHEN** 管理员配置 CLIProxyAPI management URL
- **THEN** 界面 MUST 标明该地址仅用于账号管理、OAuth 登录和状态查询
- **AND** 上游代理请求不得使用 management URL

#### Scenario: 展示出站代理说明
- **WHEN** 管理员配置 OAuth 出站代理
- **THEN** 界面 MUST 标明该代理由 CLIProxyAPI 访问 OAuth 登录与模型 API 时使用
- **AND** AutoRouter 连接 CLIProxyAPI management API 的测试结果不得被标记为出站代理测试结果

### Requirement: CLIProxyAPI 连通性测试
系统 SHALL 支持对 CLIProxyAPI proxy endpoint、management endpoint 和出站代理配置分别执行连通性测试，并在失败时展示可理解的错误原因。测试 MUST 复用现有 SSRF 防护和超时控制，不得绕过现有安全校验。

#### Scenario: 测试 proxy endpoint
- **WHEN** 管理员测试 CLIProxyAPI proxy base URL
- **THEN** 系统 MUST 验证 AutoRouter 可以访问该 proxy endpoint
- **AND** 测试失败时 MUST 展示 HTTP 状态、网络错误或超时原因

#### Scenario: 测试 management endpoint
- **WHEN** 管理员测试 CLIProxyAPI management URL 与 management secret
- **THEN** 系统 MUST 验证 management API 可访问且凭据可用
- **AND** 凭据失败 MUST 与网络失败使用不同错误提示

#### Scenario: 测试 OAuth 出站代理
- **WHEN** 管理员触发出站代理连通性测试
- **THEN** 系统 MUST 调用 CLIProxyAPI 的相关配置或测试能力完成验证
- **AND** 如果当前 CLIProxyAPI 版本不支持代理测试，系统 MUST 明确提示该能力不可用

### Requirement: CLIProxyAPI 上游预设必须保留路径前缀
系统 MUST 在保存、预览、测试和代理转发 CLIProxyAPI 上游时保留管理员配置的完整 API 根路径，避免将 `http://cliproxyapi:8317/api/provider/anthropic/v1` 或 `http://cliproxyapi:8317/api/provider/google` 错误收缩为服务根地址。

#### Scenario: Claude OAuth 池保留 provider 路径
- **WHEN** Claude OAuth 池上游 base URL 为 `http://cliproxyapi:8317/api/provider/anthropic/v1`
- **THEN** 配置预览、连通性测试和代理转发 MUST 保留 `/api/provider/anthropic/v1` 路径前缀

#### Scenario: Gemini OAuth 池保留 provider 路径
- **WHEN** Gemini OAuth 池上游 base URL 为 `http://cliproxyapi:8317/api/provider/google`
- **THEN** 配置预览、连通性测试和代理转发 MUST 保留 `/api/provider/google` 路径前缀
