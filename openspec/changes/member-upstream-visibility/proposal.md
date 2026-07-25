# Proposal: 成员信息边界——上游可见性开关与密钥归属分离

## Why

多用户体系上线后，成员侧与管理侧各有一处信息边界问题：

其一，管理员给成员授权上游后，成员可在门户中看到被授权上游的名称、在自助密钥上自行挑选上游子集，并能在个人请求记录中看到每次请求实际命中的上游名称与完整路由决策。对希望把网关作为“唯一访问点”运营的管理员来说，这些信息暴露了内部供应链（接了哪些上游、各叫什么、如何路由），成员并不需要也不应该看到。需要一个**按用户**的可见性属性：默认对成员隐藏一切上游身份信息，由网关在管理员授权的上游集合内自动路由；管理员为某个用户显式放开后，该用户才恢复现有的可见与可选行为。可见性按用户独立配置，不同成员互不影响，并提供批量入口便于一次性调整全体成员。

其二，成员自建的密钥会混入管理台全局密钥列表，且列表响应不含归属信息，管理员“看得到但认不出”；同时管理台没有任何按用户查看密钥的视图，归属管理入口缺失。需要按归属分离：全局密钥页默认只展示无归属密钥，有归属密钥归入用户名下的按人视图管理。

## What Changes

- 在 `users` 表新增 `expose_upstreams` 布尔列，默认 `false`（隐藏），按用户独立配置。移除全局单例方案（不再引入 `portal_settings` 表与 `/api/admin/portal-settings` 端点）。
- 管理端写入口：单用户走 `PUT /api/admin/users/{id}`（携带 `expose_upstreams`）；批量走新增的 `PATCH /api/admin/users/upstream-visibility`（对指定用户集或全体成员一次性设置）。
- 隐藏态成员的成员侧行为（按该成员自身设置判定）：
  - `GET /api/user/upstreams` 不再返回上游选项，返回 `upstreams_visible: false` 与空列表；
  - 成员创建自助密钥不再提交上游子集，服务端自动绑定该用户当前的完整授权集（授权集为空时拒绝创建）；成员更新密钥时忽略 `upstream_ids`；
  - 成员密钥响应中的 `upstream_ids` 置空，不暴露上游数量与标识；
  - 个人请求记录响应抹除上游身份字段（`upstream_id`、`upstream_name`、`group_name`、`failover_history`、`routing_decision`、`upstream_error`）；
  - 管理员调整某用户的授权上游时，同步该用户名下自助密钥的上游集合为新授权集；该用户可见性从可见切换为隐藏（单用户或批量）时，一次性把其名下密钥重新对齐到完整授权集。
- 可见态成员保持现有行为不变，仅补一处既有缺口：管理员收回某个上游授权时，该上游同时从该成员名下密钥中移除（成员自选的其余上游保留）。此前代理只按 `api_key_upstreams` 判定授权，收回授权并不影响已建密钥，被收回的上游仍可继续路由。
- 门户前端适配：密钥对话框在隐藏态下不显示上游选择区，密钥表格对自动路由密钥显示“自动路由”标识；请求记录表沿用现有空值降级展示。
- 用户管理页前端适配：编辑用户对话框加“上游可见”开关，页面加批量设置可见性入口（全体成员一次性可见/隐藏）。
- 密钥归属分离：
  - `GET /api/admin/keys` 增加归属范围参数，默认只返回无归属密钥，可选“全部”；
  - 密钥列表响应补充 `user_id` 与 `user_name`，“全部”视图为有归属密钥展示归属徽章；
  - 用户管理页新增按人密钥视图（列出该用户名下全部密钥，跳转既有密钥详情页管理）；
  - 分配密钥对话框的候选列表只列无归属密钥，避免静默改走他人密钥的归属。

## Capabilities

### New Capabilities

- `member-upstream-visibility`: 按用户的“上游可见性”属性存储、管理端单用户与批量写入口，以及隐藏态用户的密钥与授权集自动对齐语义。

### Modified Capabilities

- `user-portal`: 成员侧上游选项、自助密钥创建/更新、密钥响应与个人请求记录在该成员为隐藏态时不暴露任何上游身份信息。
- `api-key-management-workbench`: 全局密钥列表按归属分离（默认只展示无归属密钥、可切全部并带归属标识），密钥响应携带归属信息。
- `admin-user-management`: 用户管理页新增按人密钥视图与上游可见性管理（单用户开关 + 批量入口）；分配密钥仅从无归属密钥中选取。

## Impact

- 数据模型与 PostgreSQL/SQLite 迁移：`users` 表新增 `expose_upstreams` 列（不再引入 `portal_settings` 表）。
- `user-service` 增加：`createUser` 默认隐藏、`updateUser` 支持单用户可见性并在切到隐藏时重对齐其密钥、批量 `setUsersUpstreamVisibility`；`setUserUpstreams` 按该用户可见性决定密钥同步模式；`/api/user/upstreams`、`/api/user/keys*`、`/api/user/logs` 按当前登录成员自身设置分支。
- 管理端：`PUT /api/admin/users/{id}` 增加 `expose_upstreams`；新增批量路由 `PATCH /api/admin/users/upstream-visibility`；用户管理页编辑对话框开关、批量入口、TanStack Query hooks 与中英文文案。
- 门户密钥对话框与密钥表格适配隐藏态；E2E 页面级 mock 需补充用户可见性字段与批量端点桩。
- `key-manager.listApiKeys` 增加无归属过滤与归属人信息装配；`/api/admin/keys` 与 API 转换器、TypeScript 类型补归属字段；密钥页、用户页与分配对话框相应调整。
- 新增设置服务、管理端路由、成员端路由与门户/管理台组件的聚焦测试，并执行数据库迁移一致性校验。
