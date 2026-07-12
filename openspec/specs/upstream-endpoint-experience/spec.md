# upstream-endpoint-experience Specification

## Purpose
TBD - created by archiving change optimize-upstream-management-experience. Update Purpose after archive.
## Requirements
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

#### Scenario: 官网地址输入项在基础信息区全宽展示
- **WHEN** 管理员在上游配置弹窗编辑“描述/官网地址”等基础信息
- **THEN** 官网地址输入项 MUST 与描述项保持同级可见性，并占据完整可编辑宽度

### Requirement: 长表单配置应支持快速定位
系统 SHALL 将上游长表单编辑承载于独立详情页 `/upstreams/[id]`（而非单体配置弹窗），并在页内提供快速定位与分区独立保存能力，降低管理员在长表单中查找与提交目标项的成本。详情页 MUST 提供左侧 sticky 分区导航（滚动锚点式，非 Tabs），点击导航项 MUST 滚动定位到对应配置分区；滚动容器 MUST 预留顶栏偏移避免被 Topbar 遮挡。每个配置分区 MUST 是一个独立表单，具备独立的 dirty 检测与独立的分区级保存/重置，保存按钮 MUST 在无改动时禁用（disabled-until-dirty），分区提交 MUST 仅携带本分区字段（partial update）。

#### Scenario: 点击导航后直接跳转到目标配置分区
- **WHEN** 管理员点击“计费倍率/消费限额/模型路由/熔断器/会话亲和性迁移”等配置导航项
- **THEN** 系统 MUST 滚动定位到详情页中对应的配置分区，且分区标题不被顶栏遮挡

#### Scenario: 快速定位导航在中英文界面语义一致
- **WHEN** 管理员切换界面语言
- **THEN** 导航文案与对应配置分区标题 MUST 保持一致语义，避免认知偏差

#### Scenario: 桌面端侧边目录提供统一列表与图标导航
- **WHEN** 管理员在桌面端打开上游详情页
- **THEN** 系统 MUST 提供左侧 sticky 目录式导航，包含统一列表与图标，支持一键跳转到对应配置分区

#### Scenario: 移动端使用紧凑导航保持同一跳转语义
- **WHEN** 管理员在移动端打开上游详情页
- **THEN** 系统 MUST 提供紧凑分区导航入口，并保持与桌面端一致的配置分区跳转语义

#### Scenario: 配置分区采用单一连续结构而非低级/高级分层容器
- **WHEN** 管理员在详情页连续浏览基础信息、路由、策略和稳定性配置
- **THEN** 系统 MUST 在同一滚动内容区域以独立分区呈现配置，不要求额外的“高级配置”外层容器

#### Scenario: 各分区独立保存无需滚动到底部
- **WHEN** 管理员编辑任一配置分区并准备保存或重置
- **THEN** 系统 MUST 在该分区外壳内提供保存/重置操作，无需滚动到整页底部即可提交
- **AND** 保存按钮 MUST 在该分区无改动时保持禁用

#### Scenario: 分区未保存改动显式可见
- **WHEN** 管理员修改了某分区但尚未保存
- **THEN** 系统 MUST 在该分区呈现未保存（dirty）标记，明确提示待提交的改动局限于当前分区

#### Scenario: 分区提交仅携带本分区字段
- **WHEN** 管理员保存任一配置分区
- **THEN** 系统 MUST 仅提交该分区对应字段的 partial 载荷，MUST NOT 携带其他分区字段
- **AND** 空的 API Key 输入 MUST 被视为“保持不变”而不提交该字段

#### Scenario: 配置顺序符合编辑心智
- **WHEN** 管理员按目录浏览配置项
- **THEN** 系统 MUST 以“基础信息 → 接入路由 → 策略成本 → 稳定性”顺序组织配置分区

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

