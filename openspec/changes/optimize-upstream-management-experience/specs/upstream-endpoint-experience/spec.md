## ADDED Requirements

### Requirement: 上游 Endpoint 配置自动补全与重复告警
系统 SHALL 在上游配置阶段根据已选能力自动处理 endpoint 版本后缀，降低人工拼接错误率。

#### Scenario: OpenAI 类能力自动补全 v1
- **WHEN** 管理员为支持 OpenAI/Anthropic/Codex 风格路径的上游填写 `https://example.com/codex/` 且保存配置
- **THEN** 系统 MUST 生成可用的 endpoint 基址并在后续路由中按该基址发起请求，无需用户手动补 `/v1`

#### Scenario: 检测到重复 v1 后缀时提示
- **WHEN** 管理员输入的 base URL 已包含 `/v1` 且结合自动补全规则会产生重复路径
- **THEN** 系统 MUST 在配置界面显示明确警告并避免产生重复 `.../v1/v1/...` 的最终请求地址

### Requirement: 配置界面展示最终请求地址预览
系统 SHALL 在上游配置界面实时展示最终请求地址预览，帮助管理员在保存前确认路径拼接结果。

#### Scenario: 基于能力与 base URL 计算预览
- **WHEN** 管理员修改 base URL 或能力集合
- **THEN** 系统 MUST 实时更新预览框，展示“当前配置 + 目标能力路径”推导出的最终请求地址

#### Scenario: 预览与实际转发一致
- **WHEN** 管理员保存配置后发起请求
- **THEN** 运行时实际转发地址 MUST 与保存前预览语义一致

### Requirement: 支持上游官网地址配置与跳转
系统 SHALL 支持为每个上游配置可选的官网地址，并在上游管理界面提供安全跳转入口。

#### Scenario: 配置官网地址并在列表跳转
- **WHEN** 管理员为上游填写合法官网地址并保存
- **THEN** 上游列表与详情视图 MUST 提供“官网”跳转入口并可直接访问该地址

#### Scenario: 官网地址为空时不展示跳转入口
- **WHEN** 上游未配置官网地址
- **THEN** 系统 MUST 隐藏官网跳转入口，避免无效交互
