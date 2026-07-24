## ADDED Requirements

### Requirement: 成员侧上游信息可见性

当门户上游可见性开关为隐藏（默认）时，成员侧 API 与门户 UI MUST NOT 暴露任何上游身份信息：`GET /api/user/upstreams` MUST 返回 `upstreams_visible: false` 与空选项列表；成员密钥响应中的 `upstream_ids` MUST 为空数组；个人请求记录响应 MUST 抹除 `upstream_id`、`upstream_name`、`group_name`、`failover_history`、`routing_decision` 与 `upstream_error` 字段；成员创建密钥的请求中即使携带 `upstream_ids` 也 MUST 被忽略，密钥由服务端绑定该用户授权全集；成员更新密钥时的 `upstream_ids` MUST 被忽略。门户密钥对话框 MUST 不显示上游选择区。

当开关为可见时，上述端点与 UI MUST 保持既有行为（上游选项含名称、成员可在授权集内选择子集、请求记录含路由详情）。

#### Scenario: 隐藏模式下成员看不到上游选项

- **WHEN** 隐藏模式下成员请求 `GET /api/user/upstreams`
- **THEN** 响应为 `upstreams_visible: false` 且 items 为空，门户密钥对话框不渲染上游选择区

#### Scenario: 隐藏模式下建键自动绑定授权集

- **WHEN** 隐藏模式下成员创建密钥（无论是否携带 `upstream_ids`）
- **THEN** 密钥绑定该用户当前授权全集，响应中的 `upstream_ids` 为空数组

#### Scenario: 隐藏模式下请求记录不含上游身份

- **WHEN** 隐藏模式下成员查询个人请求记录
- **THEN** 每条记录的上游身份字段均为空值，时延、token 与计费字段正常返回

#### Scenario: 可见模式保持现状

- **WHEN** 管理员打开可见开关后成员访问上游选项、密钥与请求记录
- **THEN** 行为与开关引入前一致
