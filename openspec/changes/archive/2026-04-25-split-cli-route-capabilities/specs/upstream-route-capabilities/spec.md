## MODIFIED Requirements

### Requirement: 上游支持多能力配置
系统 SHALL 允许单个 upstream 配置多个能力类型，并将该配置作为路径路由候选过滤的第一层依据；在满足能力匹配后，系统 MUST 继续按运行态约束（健康、熔断、配额、并发容量）进行候选筛选。能力集合必须能够表达同一协议族下的通用能力与 CLI 专属能力拆分。

#### Scenario: 创建 upstream 时同时配置通用与 CLI 专属能力
- **WHEN** 管理员创建 OpenAI upstream，并同时提交 `openai_responses` 与 `codex_cli_responses`
- **THEN** 系统持久化完整能力集合并在后续选路中生效

#### Scenario: 更新 upstream 能力集合
- **WHEN** 管理员在编辑 upstream 时新增或移除 `codex_cli_responses`、`claude_code_messages` 等 CLI 专属能力
- **THEN** 系统更新存储并立即用于后续路由决策

#### Scenario: 创建 CLI-only upstream
- **WHEN** 管理员仅为某个 upstream 配置 `codex_cli_responses` 或 `claude_code_messages`
- **THEN** 系统持久化该单一 CLI 专属能力
- **AND** 不得隐式补入同协议族的通用能力

#### Scenario: 能力匹配后执行并发容量过滤
- **WHEN** 请求路径已匹配某能力且该能力对应候选 upstream 中存在并发满载项
- **THEN** 系统 MUST 将并发满载 upstream 从本次候选集中排除，并继续尝试其他可用候选

#### Scenario: 并发容量排除不改变能力配置语义
- **WHEN** upstream 因并发满载在某次请求中被排除
- **THEN** 系统 MUST 保持该 upstream 的能力配置不变，且后续请求在容量恢复后仍可参与同能力路由

### Requirement: 能力配置输入校验
系统 SHALL 对 upstream 能力配置执行严格校验，拒绝未知能力类型和空能力项，并维持“一个 upstream 的能力集合必须属于同一 provider”的约束。

#### Scenario: 提交未知能力类型
- **WHEN** 管理端请求包含未定义能力标识
- **THEN** 系统返回参数校验错误并拒绝写入

#### Scenario: 提交空能力项
- **WHEN** 管理端请求中能力数组包含空字符串或重复项
- **THEN** 系统移除非法值并返回规范化后的能力集合或报错

#### Scenario: 提交同 provider 的通用与 CLI 专属能力
- **WHEN** 管理端请求同时包含 `openai_responses` 与 `codex_cli_responses`，或同时包含 `anthropic_messages` 与 `claude_code_messages`
- **THEN** 系统接受该能力集合

#### Scenario: 提交跨 provider 混合能力
- **WHEN** 管理端请求同时包含 OpenAI 与 Anthropic 的能力类型
- **THEN** 系统返回参数校验错误并拒绝写入

### Requirement: 旧配置到新能力的默认迁移
系统 SHALL 在升级后将历史能力配置规范化，并移除对旧 `codex_responses` 值的依赖。

#### Scenario: 历史能力集合规范化
- **WHEN** 迁移任务扫描到历史 upstream 能力数组包含空字符串、重复项或非法值
- **THEN** 系统写回规范化后的能力集合，仅保留合法且去重后的能力项

#### Scenario: 历史 Codex Responses 能力迁移
- **WHEN** 历史 upstream 能力集合中存在旧值 `codex_responses`
- **THEN** 系统将其迁移为 `openai_responses`
- **AND** 迁移日志明确提示管理员：若该 upstream 实际上仅允许 Codex CLI，请手动收窄为 `codex_cli_responses`

#### Scenario: 历史 Anthropic Messages 保持通用语义
- **WHEN** 历史 upstream 能力集合中存在 `anthropic_messages`
- **THEN** 系统保持其为通用 Anthropic Messages 能力
- **AND** `claude_code_messages` 需要管理员显式启用

### Requirement: 管理端图标化展示多能力状态
系统 SHALL 在 upstream 管理界面以“图标 + 文案”展示每个 upstream 已启用的能力，并支持一个 upstream 同时展示同协议族下的通用能力与 CLI 专属能力。

#### Scenario: upstream 列表展示拆分后的能力标签
- **WHEN** 管理员打开 upstream 列表
- **THEN** 每个 upstream 条目以图标徽章方式显示完整能力集合（包含文案，不得仅显示图标）
- **AND** `openai_responses`、`codex_cli_responses`、`anthropic_messages`、`claude_code_messages` 必须显示为可区分的独立标签

#### Scenario: upstream 编辑弹窗展示能力多选
- **WHEN** 管理员打开 upstream 编辑弹窗
- **THEN** 页面提供图标化能力多选组件并回显当前已配置值
- **AND** 通用能力与 CLI 专属能力在视觉上属于同一 provider 分组但必须保留独立说明文案

#### Scenario: 单 upstream 配置多个同协议能力时完整回显
- **WHEN** 某 upstream 同时配置 `openai_responses` 与 `codex_cli_responses`
- **THEN** 列表和编辑态都同时显示两个能力图标徽章，不得折叠为单一文本

#### Scenario: 图标资源不可用时的兜底展示
- **WHEN** 某能力类型对应图标资源加载失败
- **THEN** 系统使用通用兜底图标并保留能力文案，确保语义不丢失
