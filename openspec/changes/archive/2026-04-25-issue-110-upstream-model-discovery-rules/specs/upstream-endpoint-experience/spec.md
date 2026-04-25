## ADDED Requirements

### Requirement: 模型发现与连通性测试必须保留 API 根路径
系统 MUST 在模型发现和连通性测试时保留管理员配置的 API 根路径前缀，避免将带子路径的兼容接口错误收缩为仅域名根路径。

#### Scenario: 带子路径的兼容接口执行发现
- **WHEN** 上游 `base_url` 为 `https://example.com/codex/v1` 且发现模式使用 OpenAI 兼容地址
- **THEN** 系统 MUST 以 `https://example.com/codex/v1/models` 作为发现地址

#### Scenario: 根路径接口执行发现
- **WHEN** 上游 `base_url` 为标准根地址且发现模式使用 OpenAI 兼容地址
- **THEN** 系统 MUST 生成标准的 `/v1/models` 发现地址

#### Scenario: 自定义发现地址为相对路径
- **WHEN** 管理员配置相对的自定义发现地址
- **THEN** 系统 MUST 基于当前 API 根路径解析该地址，而不是退回到站点根路径

### Requirement: 模型发现地址语义必须与测试语义一致
系统 MUST 使模型发现地址解析与连通性测试地址解析遵循同一套 API 根路径规则，避免同一上游在“测试成功”和“发现失败”之间出现路径语义分裂。

#### Scenario: 同一上游在测试与发现中共用 API 根路径
- **WHEN** 管理员对同一上游先执行连通性测试，再执行模型目录刷新
- **THEN** 系统 MUST 对两者使用一致的 API 根路径解释规则

#### Scenario: 界面预期与实际请求语义一致
- **WHEN** 管理员在配置界面保存带路径前缀的上游地址
- **THEN** 后续测试和模型发现 MUST 与保存时的地址语义一致

## ADDED Requirements

### Requirement: 配置界面必须展示模型发现地址预览与模式说明
系统 MUST 在模型发现配置区域展示当前发现模式的最终地址语义和来源说明，帮助管理员在保存前理解“将访问哪个地址”以及“目录结果来自原生还是推断”。

#### Scenario: 切换发现模式时更新地址预览
- **WHEN** 管理员切换发现模式或修改自定义发现地址
- **THEN** 系统 MUST 即时更新最终发现地址预览

#### Scenario: 配置带路径前缀的 base URL
- **WHEN** 管理员为带 API 子路径的上游配置模型发现
- **THEN** 界面 MUST 在预览中保留该路径前缀，避免显示成仅域名根路径

#### Scenario: 启用 LiteLLM 回退时展示来源语义
- **WHEN** 管理员启用 LiteLLM 回退
- **THEN** 系统 MUST 明确提示回退目录属于推断候选而非上游真实返回结果
