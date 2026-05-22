## Context

`cliproxy-instance-config` 变更交付了 `cliproxy_instances` 表与连通性检测。本变更在其之上让 AutoRouter 能够管理 CLIProxyAPI 实例下的 OAuth 账号。

CLIProxyAPI 通过 `/v0/management/*` 管理 API 暴露 OAuth 账号能力。经源码核实，相关端点的契约如下：

`GET /v0/management/auth-files` 返回 `{ files: [...] }`，每个条目含 `name`、`type`、`provider`、`email`、`status`、`disabled`、`unavailable`、`priority` 等字段。`GET /v0/management/auth-files/models?name=...` 返回 `{ models: [...] }`。`GET /v0/management/{codex,anthropic,gemini-cli}-auth-url` 返回 `{ url, state }`。`GET /v0/management/get-auth-status?state=...` 返回 `{ status }`，取值为 `ok`、`wait`、`error`。`PATCH /v0/management/auth-files/status` 接收 `{ name, disabled }`。`PATCH /v0/management/auth-files/fields` 接收 `{ name, prefix?, proxy_url?, headers?, priority?, note? }`。管理 API 鉴权使用 `Authorization: Bearer <management-key>`。

约束包括：OAuth token 明文必须留在 CLIProxyAPI 的 auth-dir，不进入 AutoRouter 数据库；管理 API 为 `v0` 前缀、未冻结；管理 API 对鉴权失败按来源 IP 限流（5 次失败封禁 30 分钟）。

## Goals / Non-Goals

**Goals:**

交付 CLIProxyAPI 管理 API 客户端，集中封装本变更所需的全部管理端点调用。

交付 `cliproxy_auth_accounts` 缓存表，保存 OAuth 账号的非敏感元数据，PostgreSQL 与 SQLite 双 schema 同步。

交付账号同步能力，从 CLIProxyAPI 拉取 auth-files 并增量更新缓存表。

交付 OAuth 登录流程能力，管理端可发起登录、获取授权地址、轮询登录状态。

交付账号启停与字段管理能力，以及对应 Admin API。

为 `cliproxy_instances` 删除补充引用校验。

**Non-Goals:**

不涉及 CLI OAuth 上游创建与请求转发，由后续变更交付。

不涉及前端界面，仅交付后端能力与 API。

不在 AutoRouter 侧持久化 OAuth 登录会话，登录状态由 CLIProxyAPI 通过 `state` 维护。

## Decisions

### 决策一：管理 API 客户端单一模块

新增 `src/lib/services/cliproxy-management-client.ts`，集中封装全部管理 API 调用。

每个函数接收 `managementUrl` 与 `managementKey`（明文）两个参数，返回结构化结果。模块负责 URL 拼接、`Authorization: Bearer` 头注入、超时控制、`v0` 响应解析与错误归类。

`v0` 前缀意味着接口未冻结。把全部管理 API 调用收敛在单一模块，后续 CLIProxyAPI 接口变动时改动面集中。`cliproxy-connection-tester.ts` 中已有的探活逻辑保持独立，因为它面向“连通性检测”这一独立语义，与账号管理职责不同。

封装的函数包括：列出 auth-files、查询某 auth-file 的模型、更新账号启用状态、更新账号字段、获取 OAuth 授权地址、查询 OAuth 登录状态。

### 决策二：账号元数据缓存表

新增 `cliproxy_auth_accounts` 表，缓存 auth-files 的非敏感字段。

```
┌──────────────────────────────────────────────────────────────────┐
│ cliproxy_auth_accounts                                            │
├──────────────────────────┬──────────────────────────────────────  │
│ id                       │ 主键                                   │
│ instance_id              │ 外键 → cliproxy_instances.id           │
│                          │ onDelete: cascade                      │
│ auth_file_name           │ CLIProxyAPI auth-file 名称             │
│ provider                 │ 服务商: codex | anthropic | gemini     │
│ email                    │ 账号邮箱，可空                         │
│ status                   │ 账号状态文本                           │
│ disabled                 │ 是否停用，布尔                         │
│ prefix                   │ 账号前缀，可空                         │
│ model_count              │ 模型数量                               │
│ priority                 │ 优先级，可空                           │
│ note                     │ 备注，可空                             │
│ raw_metadata             │ 非敏感字段原始 JSON 快照               │
│ last_synced_at           │ 最近一次从 CLIProxyAPI 同步的时间      │
│ created_at / updated_at  │ 时间戳                                 │
└──────────────────────────┴────────────────────────────────────────┘
唯一约束: (instance_id, auth_file_name)
```

缓存非敏感元数据而非每次实时查询 CLIProxyAPI，原因是管理页列表展示、上游创建选择、故障排查都需要可离线查看的账号视图，CLIProxyAPI 临时不可达时 `last_synced_at` 仍可作为数据时效参考。

`raw_metadata` 仅保存 auth-files 响应中的非敏感字段快照。token 文件内容、access token、refresh token、id_token 一律不写入。`(instance_id, auth_file_name)` 唯一约束保证同步时可按该键 upsert。

考虑过完全实时查询不落库，被否决，因为管理页可用性会直接绑定 CLIProxyAPI 即时状态。

### 决策三：账号同步策略

同步服务从 CLIProxyAPI 拉取 auth-files，按 `(instance_id, auth_file_name)` upsert 到缓存表，并删除 CLIProxyAPI 侧已不存在的本地缓存条目。

```
   同步流程
   ════════════════════════════════════════════════════

   listAuthFiles(instance) ──▶ CLIProxyAPI 返回 files[]
            │
            ▼
   对每个 file:
     ├─ 解析非敏感字段 (name/provider/email/status/...)
     ├─ 可选: getAuthFileModels 取模型数量
     └─ upsert into cliproxy_auth_accounts
            │
            ▼
   删除本地存在、但本次 files[] 中已不存在的缓存条目
            │
            ▼
   返回同步结果 (新增/更新/移除计数)
```

模型数量通过 `GET /v0/management/auth-files/models` 获取。为控制同步开销，模型数量查询对每个账号串行执行并容忍单个失败，单个账号模型查询失败时该账号 `model_count` 保留上次值或置零，不中断整体同步。

### 决策四：OAuth 登录流程无状态化

OAuth 登录在 AutoRouter 侧不持久化会话。

```
   登录流程
   ════════════════════════════════════════════════════════════

   1. 管理端选择实例 + 服务商
        │
        ▼
   2. AutoRouter ──▶ CLIProxyAPI GET /{provider}-auth-url?is_webui=true
        │            返回 { url, state }
        ▼
   3. AutoRouter 将 { url, state } 返回管理端
        │
        ▼
   4. 管理端展示授权 URL，用户在浏览器完成授权
        │
        ▼
   5. 管理端持 state 轮询 AutoRouter
        │   AutoRouter ──▶ CLIProxyAPI GET /get-auth-status?state=...
        │   返回 { status: ok | wait | error }
        ▼
   6. status = ok ──▶ AutoRouter 触发该实例账号同步，刷新缓存
      status = wait ──▶ 管理端继续轮询
      status = error ──▶ 管理端展示错误并停止
```

`state` 由 CLIProxyAPI 生成并维护登录会话，AutoRouter 只需透传。AutoRouter 不新建会话表，避免维护与 CLIProxyAPI 重复的状态。

`is_webui=true` 对受管 sidecar 与外部服务两种部署都默认携带。CLIProxyAPI 在该参数下启动 `callbackForwarder`，把 provider 固定回调端口的回调转发到管理 URL，使容器与远程部署下的浏览器 OAuth 流程可用。AutoRouter 不监听 provider 的固定回调端口，回调处理完全由 CLIProxyAPI 负责。

登录成功后由 AutoRouter 主动触发一次账号同步，使新登录账号立即出现在缓存表中。

### 决策五：账号启停与字段管理

账号启停调用 `PATCH /v0/management/auth-files/status`，字段管理调用 `PATCH /v0/management/auth-files/fields`。

字段管理支持设置前缀、出站代理、优先级、备注。AutoRouter 管理 API 接收这些字段，转发到 CLIProxyAPI，成功后同步更新本地缓存表对应字段。account prefix 的设置为后续“单账号映射成上游”变更提供基础。

### 决策六：实例删除引用校验

在 `cliproxy-instance-crud.ts` 的 `deleteCliproxyInstance` 已预留的扩展点补充校验：删除前查询 `cliproxy_auth_accounts` 中是否存在引用该实例的缓存账号，存在则抛出 `CliproxyInstanceInUseError`，由 API 层返回 409。

数据库外键 `onDelete: cascade` 是兜底保护，应用层显式校验给出可理解的错误信息，避免管理员误删仍在使用的实例。

### 决策七：Admin API 路由结构

```
src/app/api/admin/cliproxy/instances/[id]/
├── auth-accounts/
│   ├── route.ts              GET 列出实例下账号
│   ├── sync/route.ts         POST 触发账号同步
│   └── [accountName]/
│       ├── route.ts          PATCH 更新账号字段
│       └── status/route.ts   PATCH 启停账号
└── oauth-login/
    ├── route.ts              POST 发起 OAuth 登录
    └── status/route.ts       GET 轮询登录状态
```

账号以 auth-file 名称作为路径标识。所有路由复用 `validateAdminAuth` 鉴权与既有错误响应约定。

## Risks / Trade-offs

[CLIProxyAPI 管理 API 未冻结] → `v0` 前缀，字段可能变动。缓解措施是全部调用集中在 `cliproxy-management-client.ts`，并对响应缺字段做容错解析。

[同步时模型数量查询放大请求量] → 每个账号一次模型查询，账号多时同步耗时增加。缓解措施是串行查询、单个失败不中断、模型数量作为非关键字段容忍缺失。

[OAuth 登录轮询触发 IP 限流] → 轮询查询 `get-auth-status` 自身不是鉴权失败，不触发限流；但管理密钥错误会。缓解措施是轮询前依赖实例已通过连通性检测，并为轮询设置间隔下限与总时长上限。

[token 明文泄露] → 缓存表与同步过程必须只取非敏感字段。缓解措施是同步解析函数显式列举允许字段白名单，`raw_metadata` 按白名单裁剪，绝不整体透传 auth-files 条目。

[账号字段更新两侧不一致] → 先改 CLIProxyAPI 再改本地缓存，中间失败会产生短暂不一致。缓解措施是以 CLIProxyAPI 为准，本地缓存更新失败时下次同步自动纠正。

[登录状态轮询在成功时内联执行账号同步] → `pollCliproxyOAuthStatus` 在状态为 `ok` 时同步执行账号同步，同步包含一次 auth-files 拉取与每账号一次模型查询，账号多且 CLIProxyAPI 较慢时该次轮询响应耗时会明显增加。本变更接受这一行为：登录完成后的一次同步等待属于合理的登录收尾，且仅发生在状态首次变为 `ok` 的那一次轮询。若后续实测耗时不可接受，再评估改为异步同步并引入“同步进行中”状态。`provider` 与 `status` 字段在缓存表中按自由文本存储，不设长度上限，避免 CLIProxyAPI 返回较长状态文本时写入截断。

## Migration Plan

数据库迁移通过 `pnpm db:generate` 与 `pnpm db:generate:sqlite` 生成。`cliproxy_auth_accounts` 是新增表，含指向 `cliproxy_instances` 的外键，迁移为纯新增。

部署顺序为先应用数据库迁移，再部署应用代码。新表在被后续上游变更引用前不影响既有功能。

回滚策略：新增表与 API 相互独立，回滚移除新代码即可，缓存表可保留为空表。`deleteCliproxyInstance` 的引用校验为新增分支，回滚后退回“直接允许删除”行为。

## Open Questions

CLIProxyAPI auth-files 条目中 `provider`/`type` 字段对 Codex、Claude、Gemini 的确切取值需在联调时核对，解析逻辑集中在管理 API 客户端，必要时调整映射。

`get-auth-status` 返回 `ok` 同时表示“无会话”与“会话完成”两种语义。AutoRouter 发起登录后立即开始轮询，首次即 `ok` 的情形需在轮询逻辑中结合“是否曾观察到 wait”加以区分，或接受 `ok` 即视为可同步并以同步结果为准。本变更采用后者：`ok` 即触发同步，以同步结果为最终依据。
