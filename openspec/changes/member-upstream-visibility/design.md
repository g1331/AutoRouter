# Design: 成员上游可见性开关

## 背景与目标

现状下成员通过三条通道接触上游身份信息：

1. `GET /api/user/upstreams`（门户密钥对话框的上游多选列表，含名称）；
2. 成员密钥响应中的 `upstream_ids`（数量与标识）；
3. `GET /api/user/logs`（复用管理端 `LogsTable`，含 `upstream_name`、路由决策时间线、故障转移历史）。

目标：一个管理员开关，默认关闭（隐藏）。隐藏时以上通道全部不出上游身份，密钥在授权集内由网关内部路由；打开后恢复现状。

## 数据模型

沿用 `traffic_recording_settings` 的单例行模式：

```
portal_settings
┌────────────┬───────────┬─────────────────────────────┐
│ id         │ varchar32 │ PK, default 'default'       │
│ expose_upstreams │ boolean │ not null, default false │
│ created_at │ timestamp │ not null, defaultNow        │
│ updated_at │ timestamp │ not null, defaultNow        │
└────────────┴───────────┴─────────────────────────────┘
```

读取即 upsert 默认行（`getPortalSettings`），与 `getTrafficRecordingSettings` 完全同构。PG 与 SQLite schema 同步修改并各自生成迁移。

## 关键决策：密钥上游集合的对齐采用“物化”而非“代理时动态解析”

隐藏模式的语义是“成员密钥在其授权集内自动路由”。两种实现：

- A. 物化（选用）：密钥的 `api_key_upstreams` 始终显式存储，在三个写入口保持与授权集一致——成员建密钥时绑全量授权集、管理员改授权时重同步该用户密钥、开关切到隐藏时全量重对齐。
- B. 代理时动态解析：路由候选构建阶段对成员密钥改查 `user_upstreams`。

选 A 的原因：不触碰代理热路径（最关键路径零风险、零额外查询）；密钥数据自洽，管理端密钥详情看到的授权集即真实路由集；开关切换的影响在切换动作内一次性完成、可观察。代价是多一个写路径（`setUserUpstreams` 内循环 `updateApiKey`），成员/密钥规模小，可接受。

管理员通过管理端密钥 API 单独改某把成员密钥的上游集合时不做强制对齐——那是管理员的显式意图。

## 行为矩阵

| 接口 | 可见（开） | 隐藏（默认关） |
|---|---|---|
| GET /api/user/upstreams | `{upstreams_visible:true, items:[{id,name}...]}` | `{upstreams_visible:false, items:[]}` |
| POST /api/user/keys | `upstream_ids` 必填非空，校验子集 | 忽略 `upstream_ids`，绑当前授权全集；授权集为空返回 403 |
| PUT /api/user/keys/[id] | 可改 `upstream_ids`（子集校验） | 忽略 `upstream_ids` |
| 成员密钥响应 | 原样返回 `upstream_ids` | `upstream_ids: []` |
| GET /api/user/logs | 原样 | 抹除 `upstream_id`、`upstream_name`、`group_name`、`failover_history`、`routing_decision`、`upstream_error` |
| PATCH admin 授权上游 | 仅换授权集 | 换授权集后，重同步该用户名下密钥为新授权集 |
| PATCH 开关 → 隐藏 | — | 全量重对齐所有成员名下密钥到各自授权全集 |

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

- `usePortalUpstreamOptions` 响应类型改为 `{ upstreams_visible, items }`；对话框据此隐藏选择区并在提交时省略 `upstream_ids`，表单校验对隐藏模式跳过“至少选一个”。
- 密钥表格“上游”列：`upstream_ids` 为空时显示“自动路由”文案（可见模式下 restricted 密钥必然非空，无歧义）。
- 请求记录表：上游身份字段为 null 时 `LogsTable` 已有空值降级（显示占位符），不改组件。
- 管理端设置页 `settingsItems` 增加一项内联 Switch（成员上游可见性），配 `GET/PATCH /api/admin/portal-settings` 的 hooks；切到隐藏为带副作用操作（重对齐密钥），Switch 直接执行、toast 反馈结果。

## 测试与兼容

- 服务层：`portal-settings-service`（默认行、更新、切隐藏触发重对齐）；`setUserUpstreams` 隐藏模式重同步。
- 路由层：成员三端点在两种模式下的行为分支；管理端 portal-settings 路由鉴权与校验。
- 组件：门户密钥对话框隐藏模式渲染与提交载荷、密钥表格“自动路由”展示。
- E2E：现有 portal/设置页 spec 的页面级 mock 需补 `/api/admin/portal-settings` 与新版 `/api/user/upstreams` 响应桩。
- 升级兼容：默认值为隐藏，升级后即生效（这正是需求语义）；已存在的成员密钥在管理员下一次改授权或切换开关时被对齐，读路径不依赖对齐是否发生。
