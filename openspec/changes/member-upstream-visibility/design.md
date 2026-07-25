# Design: 成员信息边界——上游可见性开关与密钥归属分离

## 背景与目标

现状下成员通过三条通道接触上游身份信息：

1. `GET /api/user/upstreams`（门户密钥对话框的上游多选列表，含名称）；
2. 成员密钥响应中的 `upstream_ids`（数量与标识）；
3. `GET /api/user/logs`（复用管理端 `LogsTable`，含 `upstream_name`、路由决策时间线、故障转移历史）。

目标：一个**按用户**的可见性属性，默认隐藏。某成员为隐藏时以上通道全部不出上游身份，密钥在授权集内由网关内部路由；管理员为该成员放开后恢复现状。成员之间互不影响，并提供批量入口一次性调整全体成员。

## 数据模型

可见性是用户自身的属性，直接落在 `users` 表上，而非独立单例表：

```
users（新增一列）
┌──────────────────┬─────────┬──────────────────────────┐
│ expose_upstreams │ boolean │ not null, default false  │
└──────────────────┴─────────┴──────────────────────────┘
```

选按用户列而非全局单例的原因：需求就是“按用户单独控制”，全局单例无法表达“张三可见、李四隐藏”；用户属性随用户行读取，成员端点拿到 principal 即可得到该成员的可见性，无需额外单例查询。PG 与 SQLite schema 同步加列并各自生成迁移；默认 `false` 使既有用户与新用户都默认隐藏，符合需求。

## 关键决策：密钥上游集合的对齐采用“物化”而非“代理时动态解析”

隐藏态用户的语义是“该成员密钥在其授权集内自动路由”。两种实现：

- A. 物化（选用）：密钥的 `api_key_upstreams` 始终显式存储，在三个写入口保持与授权集一致——成员建密钥时绑全量授权集、管理员改授权时重同步该用户密钥、该用户可见性切到隐藏（单用户或批量）时重对齐其密钥。
- B. 代理时动态解析：路由候选构建阶段对成员密钥改查 `user_upstreams`。

选 A 的原因：不触碰代理热路径（最关键路径零风险、零额外查询）；密钥数据自洽，管理端密钥详情看到的授权集即真实路由集；可见性切换的影响在切换动作内一次性完成、可观察。代价是多一个写路径（`setUserUpstreams` 内做一次批量对齐），成员/密钥规模小，可接受。

管理员通过管理端密钥 API 单独改某把成员密钥的上游集合时不做强制对齐——那是管理员的显式意图。

对齐有两种模式，都只作用于 `role='member'` 的归属人名下的密钥，判定依据取该用户自身的 `expose_upstreams`：

- `replace`（该用户隐藏）：密钥上游集合 = 授权全集。
- `intersect`（该用户可见）：只剔除已被收回的上游，成员自选的其余部分保留。

`intersect` 顺带补上一处既有缺口：代理侧的授权集只读 `api_key_upstreams`，此前管理员收回授权并不会同步收回已建密钥上的该上游，被收回的上游仍可继续路由。两种模式都在 `setUserUpstreams` 的同一个事务内完成，授权变更与密钥收敛要么一起生效、要么一起回滚。可见性从可见切换为隐藏（`updateUser` 或批量 `setUsersUpstreamVisibility`）时，对每个受影响用户按 `replace` 重对齐其密钥。

## 行为矩阵

按该成员自身的 `expose_upstreams` 分支：

| 接口 | 该成员可见 | 该成员隐藏（默认） |
|---|---|---|
| GET /api/user/upstreams | `{upstreams_visible:true, items:[{id,name}...]}` | `{upstreams_visible:false, items:[]}` |
| POST /api/user/keys | `upstream_ids` 必填非空，校验子集 | 忽略 `upstream_ids`，绑当前授权全集；授权集为空返回 403 |
| PUT /api/user/keys/[id] | 可改 `upstream_ids`（子集校验） | 忽略 `upstream_ids` |
| 成员密钥响应 | 原样返回 `upstream_ids` | `upstream_ids: []` |
| GET /api/user/logs | 原样 | 抹除 `upstream_id`、`upstream_name`、`group_name`、`failover_history`、`routing_decision`、`upstream_error` |
| PATCH admin 授权上游 | 换授权集后，从该用户名下密钥中剔除被收回的上游（保留成员自选的其余部分） | 换授权集后，重同步该用户名下密钥为新授权集 |
| PATCH 用户可见性 → 隐藏（单用户/批量） | — | 重对齐受影响用户名下密钥到各自授权全集 |

`failover_attempts` 计数、时延、token、计费字段不含上游身份，保留。`/api/user/logs/stats` 为窗口聚合，无上游字段，不动。

## 前端

门户密钥对话框（隐藏模式）：

```
┌─ 新建密钥 ────────────────────┐      ┌─ 新建密钥（隐藏模式）────────┐
│ 名称        [____________]    │      │ 名称        [____________]   │
│ 描述        [____________]    │      │ 描述        [____________]   │
│ 可用上游 *                    │  →   │ （无上游选择区；路由由网关   │
│  ☑ upstream-a                 │      │   在管理员授权范围内自动完成）│
│  ☐ upstream-b                 │      │ 消费限额 …                   │
│ 消费限额 …                    │      └──────────────────────────────┘
└───────────────────────────────┘
```

- `usePortalUpstreamOptions` 响应类型为 `{ upstreams_visible, items }`；对话框据此隐藏选择区并在提交时省略 `upstream_ids`，表单校验对隐藏态跳过“至少选一个”。
- 密钥表格“上游”列：`upstream_ids` 为空时显示“自动路由”文案（可见态下 restricted 密钥必然非空，无歧义）。
- 请求记录表：上游身份字段为 null 时 `LogsTable` 已有空值降级（显示占位符），不改组件。
- 门户成员侧组件不随本次改动而变——它们消费 `/api/user/upstreams` 的 `upstreams_visible`，该值现由登录成员自身设置驱动。

管理端用户管理页：

- 编辑用户对话框加“上游可见”开关，走既有 `PATCH /api/admin/users/{id}`（`updateUser` 增 `exposeUpstreams`）。切到隐藏为带副作用操作（重对齐该用户密钥）。
- 页面加批量入口：对全体成员一次性设为可见/隐藏，走新增 `PATCH /api/admin/users/upstream-visibility`；批量以确认对话框防误触，成功后 toast 反馈受影响用户数。端点 body 支持可选 `user_ids`（省略即全体成员），UI 先落地“全体成员”粒度，按需再加子集选择。

## 密钥归属分离

### 约束：按归属划分，而非按创建者

`api_keys` 没有创建者字段，成员自建与管理员分配的密钥落库后不可区分。分离维度取 `user_id` 归属：无归属（`user_id IS NULL`）留在全局密钥页；有归属归入该用户的按人视图。管理员把密钥分配给某人后，密钥从全局列表移入该用户名下，模型自洽。

### 后端

- `listApiKeys` 的过滤器增加 `unowned: true`（`user_id IS NULL`）；`/api/admin/keys` 增加 `owner_scope=unowned|all` 查询参数，默认 `unowned`。
- `ApiKeyListItem` / `ApiKeyApiResponse` 增加 `userId`/`user_id` 与 `userName`/`user_name`（按页内密钥的归属人一次性批量查 users 表装配，无 N+1）。
- 按人列表复用既有 `listApiKeys(page, pageSize, { userId })`，走 `GET /api/admin/keys?user_id=<id>`（与 `owner_scope` 互斥，指定 `user_id` 时忽略范围参数）。

### 前端

```
密钥页（默认：未归属）                     用户管理页
┌─ 密钥 ──────── [范围: 未归属 ▾] ─┐      ┌─ 用户列表 ──────────────────┐
│ name-a  sk-…a1  ● active         │      │ alice  member  密钥×3  [⋯] │
│ name-b  sk-…b2  ● disabled       │      │   └ 行菜单: …「查看密钥」   │
└──────────────────────────────────┘      └─────────────┬───────────────┘
        范围切“全部”后：                                 ▼
┌─ 密钥 ────────── [范围: 全部 ▾] ─┐      ┌─ alice 的密钥 ─────────────┐
│ name-a  sk-…a1  ● active         │      │ portal-key sk-…c3 ● active │
│ name-c  sk-…c3  ● active 👤alice │      │ assigned-k sk-…d4 ● locked │
└──────────────────────────────────┘      │  （点击行 → 密钥详情页）    │
                                          └────────────────────────────┘
```

- 密钥页加范围切换（默认“未归属”，可切“全部”），“全部”视图为有归属密钥显示归属徽章（用户名）。
- 用户行菜单加“查看密钥”，弹窗列出该用户名下密钥（名称、前缀、启停/管理员锁定状态、额度状态），点击行跳转既有密钥详情页做完整管理。
- 分配密钥对话框候选列表改为只请求无归属密钥（`owner_scope=unowned`），消除静默改走他人密钥归属的坑。

## 测试与兼容

- 服务层：`user-service` 的 `createUser` 默认隐藏、`updateUser` 切隐藏触发重对齐、批量 `setUsersUpstreamVisibility`；`setUserUpstreams` 按该用户可见性选择对齐模式；`listApiKeys` 的 `unowned` 过滤与归属装配。
- 路由层：成员三端点按当前登录成员自身可见性分支；`PATCH /api/admin/users/{id}` 的 `expose_upstreams`；批量 `/api/admin/users/upstream-visibility` 鉴权与校验；`/api/admin/keys` 的 `owner_scope` 与 `user_id` 参数分支。
- 组件：门户密钥对话框隐藏态渲染与提交载荷、密钥表格“自动路由”展示；用户管理页编辑对话框可见性开关、批量入口；管理台密钥页范围切换与归属徽章、用户密钥弹窗、分配对话框仅列无归属密钥。
- E2E：现有 portal spec 的 `/api/user/upstreams` 桩沿用 `{upstreams_visible, items}`；admin-page-mocks 的用户 fixture 补 `expose_upstreams`，移除 portal-settings 桩。
- 升级兼容：新列默认隐藏，升级后既有用户即为隐藏（这正是需求语义）；已存在的成员密钥在管理员下一次改授权或切换该用户可见性时被对齐，读路径不依赖对齐是否发生。
