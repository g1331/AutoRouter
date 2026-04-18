# path-based-routing Specification

## Purpose
TBD - created by archiving change path-capability-routing. Update Purpose after archive.
## Requirements
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
系统 SHALL 按“能力匹配 → API Key 授权 → 模型规则过滤 → 上游可用性”顺序过滤候选上游，并将过滤后的结果交给现有分层选择与故障转移机制。

#### Scenario: 能力命中且存在通过模型规则的可用候选
- **WHEN** 某能力类型下存在至少一个已授权、命中模型规则且通过可用性选择器（熔断/故障转移）可用的上游
- **THEN** 系统使用现有优先级、权重与故障转移策略完成上游选择

#### Scenario: 能力命中但无授权候选
- **WHEN** 能力类型匹配成功，但 API Key 对应授权集合中没有任何候选上游
- **THEN** 系统返回标准化不可用错误，并标记未发送上游请求

#### Scenario: 授权候选全部被模型规则排除
- **WHEN** 能力类型匹配成功且存在已授权候选，但这些候选都因模型规则未命中而被排除
- **THEN** 系统 MUST 返回标准化不可用错误，并明确原因属于模型规则过滤

#### Scenario: 未配置显式模型规则的授权候选继续参与选择
- **WHEN** 已授权候选中同时存在“配置了显式模型规则的上游”和“未配置显式模型规则的上游”
- **THEN** 系统 MUST 仅排除未命中显式规则的上游，并允许未配置显式规则的上游继续进入可用性选择

### Requirement: 模型规则过滤结果必须进入路由诊断信息
系统 MUST 在路径能力路由的诊断信息中记录模型规则过滤结果，便于管理员区分“无授权候选”“规则未命中”“可用性筛除”等不同原因。

#### Scenario: 上游因模型规则未命中被排除
- **WHEN** 某授权上游被模型规则过滤阶段排除
- **THEN** 路由诊断信息 MUST 记录该上游被排除以及原因属于 `model_not_allowed`

#### Scenario: 别名规则改变最终模型
- **WHEN** 最终选中的上游通过别名规则将请求模型解析为另一个目标模型
- **THEN** 路由诊断信息 MUST 同时记录原始模型、解析后模型和规则命中类型

### Requirement: 路径能力路由可观测性
系统 SHALL 在路由决策日志中记录路径能力匹配结果和匹配来源，支持问题排查。

#### Scenario: 路径命中能力
- **WHEN** 请求通过路径规则命中能力类型
- **THEN** 日志记录 `matched_route_capability` 和 `route_match_source=path`

#### Scenario: 未命中能力路径
- **WHEN** 请求未命中能力路径
- **THEN** 日志记录错误上下文与请求路径，并明确未进入上游转发链路
- **AND** 记录告警日志用于区分“路径未命中能力”“能力命中但无候选”“有候选但未授权”“授权候选全部不可用”
