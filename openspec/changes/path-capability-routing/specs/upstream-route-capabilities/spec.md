## ADDED Requirements

### Requirement: 上游支持多能力配置
系统 SHALL 允许单个上游配置多个能力类型，并将该配置作为路径路由候选过滤的依据。

#### Scenario: 创建上游时配置多个能力
- **WHEN** 管理员创建上游并提交多个能力类型
- **THEN** 系统持久化完整能力集合并在后续选路中生效

#### Scenario: 更新上游能力集合
- **WHEN** 管理员在编辑上游时新增或移除能力类型
- **THEN** 系统更新存储并立即用于后续路由决策

### Requirement: 能力配置输入校验
系统 SHALL 对上游能力配置执行严格校验，拒绝未知能力类型和空能力项。

#### Scenario: 提交未知能力类型
- **WHEN** 管理端请求包含未定义能力标识
- **THEN** 系统返回参数校验错误并拒绝写入

#### Scenario: 提交空能力项
- **WHEN** 管理端请求中能力数组包含空字符串或重复项
- **THEN** 系统移除非法值并返回规范化后的能力集合或报错

### Requirement: 旧配置到新能力的默认迁移
系统 SHALL 在升级后为已有上游生成默认能力集合，避免升级后立即失去可路由性。

#### Scenario: OpenAI 类型上游自动映射
- **WHEN** 迁移任务扫描到 `providerType=openai` 的历史上游
- **THEN** 系统为该上游补齐 `codex_responses`、`openai_chat_compatible`、`openai_extended`

#### Scenario: Custom 类型上游待人工确认
- **WHEN** 迁移任务扫描到 `providerType=custom` 的历史上游
- **THEN** 系统保留空能力集合并在管理端提示需要人工配置

### Requirement: 管理端展示多能力状态
系统 SHALL 在上游管理界面展示每个上游已启用的能力标签，支持快速识别可承接的请求类型。

#### Scenario: 上游列表展示能力标签
- **WHEN** 管理员打开上游列表
- **THEN** 每个上游条目显示其能力标签集合

#### Scenario: 上游编辑弹窗展示能力多选
- **WHEN** 管理员打开上游编辑弹窗
- **THEN** 页面提供能力多选组件并回显当前已配置值
