## MODIFIED Requirements

### Requirement: 上游支持多能力配置
系统 SHALL 允许单个 upstream 配置多个能力类型，并将该配置作为路径路由候选过滤的第一层依据；在满足能力匹配后，系统 MUST 继续按运行态约束（健康、熔断、配额、并发容量）进行候选筛选。能力集合必须能够表达同一协议族下的通用能力、CLI 专属能力以及 CLIProxyAPI OAuth 池上游的协议映射。

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

#### Scenario: 创建 CLIProxyAPI Codex OAuth 池 upstream
- **WHEN** 管理员通过 CLIProxyAPI Codex OAuth 池预设创建 upstream
- **THEN** 系统 MUST 持久化 `codex_cli_responses` 能力
- **AND** 如果管理员保留通用 OpenAI Responses 兼容能力，系统 MUST 同时持久化 `openai_responses`

#### Scenario: 创建 CLIProxyAPI Claude OAuth 池 upstream
- **WHEN** 管理员通过 CLIProxyAPI Claude OAuth 池预设创建 upstream
- **THEN** 系统 MUST 持久化 `claude_code_messages` 能力
- **AND** 如果管理员保留通用 Anthropic Messages 兼容能力，系统 MUST 同时持久化 `anthropic_messages`

#### Scenario: 创建 CLIProxyAPI Gemini OAuth 池 upstream
- **WHEN** 管理员通过 CLIProxyAPI Gemini OAuth 池预设创建 upstream
- **THEN** 系统 MUST 持久化 `gemini_native_generate` 能力
- **AND** 系统不得隐式添加 OpenAI 或 Anthropic provider 的能力

#### Scenario: 能力匹配后执行并发容量过滤
- **WHEN** 请求路径已匹配某能力且该能力对应候选 upstream 中存在并发满载项
- **THEN** 系统 MUST 将并发满载 upstream 从本次候选集中排除，并继续尝试其他可用候选

#### Scenario: 并发容量排除不改变能力配置语义
- **WHEN** upstream 因并发满载在某次请求中被排除
- **THEN** 系统 MUST 保持该 upstream 的能力配置不变，且后续请求在容量恢复后仍可参与同能力路由

### Requirement: 管理端图标化展示多能力状态
系统 SHALL 在 upstream 管理界面以“图标 + 文案”展示每个 upstream 已启用的能力，并支持一个 upstream 同时展示同协议族下的通用能力、CLI 专属能力和 CLIProxyAPI OAuth 池来源信息。

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

#### Scenario: CLIProxyAPI OAuth 池显示来源标记
- **WHEN** 某 upstream 由 CLIProxyAPI OAuth 池预设创建
- **THEN** 列表和编辑态 MUST 在能力区域展示 CLIProxyAPI 来源标记
- **AND** 来源标记不得替代具体 route capability 文案

#### Scenario: 图标资源不可用时的兜底展示
- **WHEN** 某能力类型对应图标资源加载失败
- **THEN** 系统使用通用兜底图标并保留能力文案，确保语义不丢失
