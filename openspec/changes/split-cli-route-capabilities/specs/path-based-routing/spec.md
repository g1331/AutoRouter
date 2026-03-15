## MODIFIED Requirements

### Requirement: 路径能力优先匹配
系统 SHALL 在代理入口先基于请求方法和路径匹配协议族，再根据请求头特征解析最终能力，然后再决定候选上游集合。

#### Scenario: Responses 请求命中通用协议能力
- **WHEN** 收到 `POST /v1/responses` 请求，且请求头未命中 Codex CLI 特征
- **THEN** 系统将其最终能力类型判定为 `openai_responses`

#### Scenario: Responses 请求命中 Codex CLI 专属能力
- **WHEN** 收到 `POST /v1/responses` 请求，且请求头满足任一 Codex CLI 特征，例如 `originator=codex_cli_rs`、`user-agent` 以 `codex_cli_rs/` 开头，或存在 `x-codex-*` 头部
- **THEN** 系统将其最终能力类型判定为 `codex_cli_responses`

#### Scenario: Messages 请求命中通用协议能力
- **WHEN** 收到 `POST /v1/messages` 请求，且请求头未命中 Claude Code CLI 特征
- **THEN** 系统将其最终能力类型判定为 `anthropic_messages`

#### Scenario: Messages 请求命中 Claude Code 专属能力
- **WHEN** 收到 `POST /v1/messages` 或 `POST /v1/messages/count_tokens` 请求，且请求头包含 `anthropic-beta` 中的 `claude-code-*` 标记，或同时满足 `user-agent` 以 `claude-cli/` 开头且 `x-app=cli`
- **THEN** 系统将其最终能力类型判定为 `claude_code_messages`

#### Scenario: 代理子路径与完整路径都可命中同一协议族
- **WHEN** 收到 `POST /api/proxy/v1/responses` 并在代理内部得到子路径 `responses`
- **THEN** 系统仍先将其归类到 Responses 协议族，再按同一组 header 规则解析最终能力
- **AND** 对 `messages`、`messages/count_tokens`、`chat/completions` 等同类 `v1` 子路径执行同样规则

#### Scenario: 未命中能力路径时直接返回错误
- **WHEN** 请求路径不在能力映射表内
- **THEN** 系统返回标准化“未匹配路径能力”错误，不进入模型路由兜底

### Requirement: 能力路由候选集过滤
系统 SHALL 按“最终能力精确匹配 → API Key 授权 → 上游可用性”顺序过滤候选上游，并将过滤后的结果交给现有分层选择与故障转移机制；当最终能力为 CLI 专属能力且精确匹配候选为空时，系统 MUST 回退到同协议族的通用能力候选池重新执行同一过滤链路。

#### Scenario: CLI 专属请求命中专属候选
- **WHEN** 请求最终能力为 `codex_cli_responses` 或 `claude_code_messages`，且存在至少一个已授权且可用的同名能力上游
- **THEN** 系统仅使用该 CLI 专属能力候选池参与后续选择，不混入同协议的通用能力候选

#### Scenario: CLI 专属请求回退到通用能力
- **WHEN** 请求最终能力为 `codex_cli_responses` 或 `claude_code_messages`，但其专属能力候选在授权与可用性过滤后为空
- **THEN** 系统回退到同协议族的通用能力候选池重新执行过滤
- **AND** `codex_cli_responses` 只能回退到 `openai_responses`
- **AND** `claude_code_messages` 只能回退到 `anthropic_messages`

#### Scenario: 通用请求不得命中 CLI 专属 upstream
- **WHEN** 请求最终能力为 `openai_responses` 或 `anthropic_messages`
- **THEN** 系统只允许使用同名通用能力候选
- **AND** 不得将仅声明 `codex_cli_responses` 或 `claude_code_messages` 的 upstream 纳入本次候选集

#### Scenario: 能力命中但无授权候选
- **WHEN** 最终能力及其允许的通用回退能力都匹配成功，但 API Key 对应授权集合中没有任何可用 upstream
- **THEN** 系统返回标准化不可用错误，并标记未发送上游请求

### Requirement: 路径能力路由可观测性
系统 SHALL 在路由决策日志中记录最终能力匹配结果和匹配来源，支持问题排查。

#### Scenario: 仅通过路径协议族命中通用能力
- **WHEN** 请求通过路径协议族匹配即可确定最终能力，且未使用 CLI header 画像
- **THEN** 日志记录 `matched_route_capability`
- **AND** 日志记录 `route_match_source=path`

#### Scenario: 通过路径协议族与 header 画像命中 CLI 专属能力
- **WHEN** 请求先命中 Responses 或 Messages 协议族，再由 header 画像解析为 CLI 专属最终能力
- **THEN** 日志记录 `matched_route_capability`
- **AND** 日志记录 `route_match_source=path_header_profile`

#### Scenario: 未命中能力路径
- **WHEN** 请求未命中能力路径
- **THEN** 日志记录错误上下文与请求路径，并明确未进入上游转发链路
- **AND** 记录告警日志用于区分“路径未命中能力”“CLI 专属候选为空后回退到通用能力”“能力命中但无候选”“有候选但未授权”“授权候选全部不可用”
