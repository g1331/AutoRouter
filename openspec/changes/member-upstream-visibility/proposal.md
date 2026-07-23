# Proposal: 成员上游可见性开关（默认隐藏上游信息）

## Why

多用户体系上线后，管理员给成员授权上游，成员可在门户中看到被授权上游的名称、在自助密钥上自行挑选上游子集，并能在个人请求记录中看到每次请求实际命中的上游名称与完整路由决策。对希望把网关作为“唯一访问点”运营的管理员来说，这些信息暴露了内部供应链（接了哪些上游、各叫什么、如何路由），成员并不需要也不应该看到。需要一个开关：默认对成员隐藏一切上游身份信息，由网关在管理员授权的上游集合内自动路由；管理员显式打开开关后才恢复现有的可见与可选行为。

## What Changes

- 新增门户全局设置单例（`portal_settings` 表），含 `expose_upstreams` 布尔开关，默认 `false`（隐藏）。
- 新增管理端 API `GET/PATCH /api/admin/portal-settings`，并在设置页提供内联开关。
- 隐藏模式下的成员侧行为：
  - `GET /api/user/upstreams` 不再返回上游选项，返回 `upstreams_visible: false` 与空列表；
  - 成员创建自助密钥不再提交上游子集，服务端自动绑定该用户当前的完整授权集（授权集为空时拒绝创建）；成员更新密钥时忽略 `upstream_ids`；
  - 成员密钥响应中的 `upstream_ids` 置空，不暴露上游数量与标识；
  - 个人请求记录响应抹除上游身份字段（`upstream_id`、`upstream_name`、`group_name`、`failover_history`、`routing_decision`、`upstream_error`）；
  - 管理员调整某用户的授权上游时，同步该用户名下自助密钥的上游集合为新授权集；开关从可见切换为隐藏时，一次性把所有成员名下密钥重新对齐到各自的完整授权集。
- 可见模式（开关打开）保持现有行为不变。
- 门户前端适配：密钥对话框在隐藏模式下不显示上游选择区，密钥表格对自动路由密钥显示“自动路由”标识；请求记录表沿用现有空值降级展示。

## Capabilities

### New Capabilities

- `member-upstream-visibility`: 门户全局“上游可见性”开关的存储、管理端读写入口，以及隐藏模式下成员密钥与授权集的自动对齐语义。

### Modified Capabilities

- `user-portal`: 成员侧上游选项、自助密钥创建/更新、密钥响应与个人请求记录在隐藏模式下不暴露任何上游身份信息。

## Impact

- 数据模型与 PostgreSQL/SQLite 迁移：新增 `portal_settings` 单例表。
- 新增 `portal-settings-service`；`user-service.setUserUpstreams` 增加隐藏模式下的密钥同步；`/api/user/upstreams`、`/api/user/keys*`、`/api/user/logs` 增加可见性分支。
- 新增 `/api/admin/portal-settings` 路由、TanStack Query hooks、设置页开关与中英文文案。
- 门户密钥对话框与密钥表格适配隐藏模式；E2E 页面级 mock 需补充新端点桩。
- 新增设置服务、管理端路由、成员端路由与门户组件的聚焦测试，并执行数据库迁移一致性校验。
