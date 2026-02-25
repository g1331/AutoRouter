## ADDED Requirements

### Requirement: 路径能力优先匹配
系统 SHALL 在代理入口先基于请求方法和路径进行能力匹配，再决定候选上游集合。

#### Scenario: 命中已定义能力路径
- **WHEN** 收到 `POST /v1/responses` 请求
- **THEN** 系统将其能力类型判定为 `codex_responses`

#### Scenario: 代理子路径与完整路径都可命中同一能力
- **WHEN** 收到 `POST /api/proxy/v1/responses` 并在代理内部得到子路径 `responses`
- **THEN** 系统仍将其能力类型判定为 `codex_responses`
- **AND** 对 `chat/completions`、`messages`、`messages/count_tokens` 等同类 `v1` 子路径执行同样规则

#### Scenario: 未命中能力路径时直接返回错误
- **WHEN** 请求路径不在能力映射表内
- **THEN** 系统返回标准化“未匹配路径能力”错误，不进入模型路由兜底

### Requirement: 能力路由候选集过滤
系统 SHALL 按“能力匹配 → API Key 授权 → 上游可用性”顺序过滤候选上游，并将过滤后的结果交给现有分层选择与故障转移机制。

#### Scenario: 能力命中且存在可用候选
- **WHEN** 某能力类型下存在至少一个已授权且通过可用性选择器（熔断/故障转移）可用的上游
- **THEN** 系统使用现有优先级、权重与故障转移策略完成上游选择

#### Scenario: 能力命中但无授权候选
- **WHEN** 能力类型匹配成功，但 API Key 对应授权集合中没有任何可用上游
- **THEN** 系统返回标准化不可用错误，并标记未发送上游请求

### Requirement: 路径能力路由可观测性
系统 SHALL 在路由决策日志中记录路径能力匹配结果和匹配来源，支持问题排查。

#### Scenario: 路径命中能力
- **WHEN** 请求通过路径规则命中能力类型
- **THEN** 日志记录 `matched_route_capability` 和 `route_match_source=path`

#### Scenario: 未命中能力路径
- **WHEN** 请求未命中能力路径
- **THEN** 日志记录错误上下文与请求路径，并明确未进入上游转发链路
- **AND** 记录告警日志用于区分“路径未命中能力”“能力命中但无候选”“有候选但未授权”“授权候选全部不可用”
