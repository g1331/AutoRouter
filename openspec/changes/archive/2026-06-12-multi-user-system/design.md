## Context

当前认证体系是单一静态令牌模型，具体现状如下：

| 维度 | 现状 | 限制 |
| --- | --- | --- |
| 鉴权方式 | `validateAdminToken` 对 `ADMIN_TOKEN` 做字符串相等比较 | 只有一个管理员身份，无法区分操作者 |
| Route 鉴权 | 74 个 admin route 内联调用 `validateAdminAuth` | 鉴权逻辑分散，无角色上下文，改动需逐个文件 |
| 登录 | 登录页只有一个密码框，用 `GET /admin/keys?page_size=1` 探针验证 token | 无用户名概念，无专用登录端点 |
| 前端状态 | `AuthProvider` 在 `sessionStorage` 存单个 `admin_token` 字符串，经 `useSyncExternalStore` 直读 | 只有"有 token / 无 token"两态，无用户信息和角色 |
| 数据归属 | `api_keys.user_id` 已预留为 nullable uuid，但无外键、无索引 | 归属关系未激活 |
| 用量聚合 | `request_logs` / `request_billing_snapshots` 经 `api_key_id` 间接关联 | 数据通道存在，缺用户维度入口；密钥被删后归属链断裂 |
| 代理校验 | `/api/proxy/v1/*` 仅校验 client API key 自身的 bcrypt 与 `is_active` | 不回查密钥归属用户的状态 |
| SQLite 外键 | `getSqliteClient()` 未设置 `PRAGMA foreign_keys=ON` | SQLite 下所有外键均不具运行时强制力，纯声明性 |

`withAdminAuth` HOC 已在 `api-auth.ts` 定义但全仓库无任何调用方，可作为统一鉴权层的演进起点。项目同时维护 PostgreSQL 和 SQLite 两套 schema，已有 bcrypt（`BCRYPT_ROUNDS=12`）用于 API Key 哈希。

本变更覆盖 Issue #109 的完整目标，分两个内聚阶段：阶段一建立用户实体与角色感知的认证体系，阶段二在其上构建普通用户的自助门户。两阶段共享同一套数据模型与认证机制，因此放在同一个变更中，通过任务分组保留分批提交与分批交付的节奏——阶段一的任务全部提交后，系统已达到一个可独立合并发布的完整状态，阶段二的门户在此基础上叠加。本文档在三轮独立审查（安全、架构一致性、需求完整性）后修订，把原先延后的若干语义决策提前固定。

## Goals / Non-Goals

**Goals:**

建立 `users` 表与 `admin` / `member` 两类角色，激活 `api_keys.user_id` 归属关系。引入 JWT 认证机制并新增专用登录端点，同时保留 `ADMIN_TOKEN` 作为引导与紧急维护通道。将 74 个 route 的内联鉴权统一为一个角色感知的工具函数。提供管理员侧的用户 CRUD、API Key 所有权分配、用户可用上游配置能力。提供普通用户的自助门户：个人概览、个人请求记录、个人 API Key 自助管理、自助修改密码，全部以服务端强制的数据隔离为前提。前端认证状态升级为携带用户身份与角色的结构，并按角色把管理员导向管理后台、普通用户导向自助门户。

**Non-Goals:**

第三方登录（OAuth / OIDC）明确延后到用户模型稳定之后，本变更只做本地账号体系。密码重置与找回流程（忘记密码后的自助找回）、邮件通知、用户邀请链接作为后续增强，本阶段管理员直接设置初始密码、门户内提供已登录用户的自助改密。`member` 用户无法自助注册，账号一律由管理员创建，也无法自助修改自己的用户名（用户名作为登录标识仅由管理员变更）。用户级别的全局配额池（跨密钥的统一额度上限）不在本阶段范围内，额度仍以现有的 per-key `spending_rules` 为准。操作审计（记录谁在何时创建、停用、删除了谁，谁变更了角色）本阶段不实现，仅依赖 `created_at` / `updated_at`，留待后续单独引入审计能力。

## Decisions

### 决策一：JWT 库选用 `jose`

选择 `jose` 而非 `jsonwebtoken`。`jose` 是面向现代运行时的实现，原生支持 Web Crypto API，兼容 Next.js 的 Edge Runtime 与 Node Runtime，TypeScript 类型完善，且 Next.js 官方认证文档以它为示例。`jsonwebtoken` 依赖 Node 原生 crypto，在 Edge 环境受限。虽然当前路由保护在客户端完成，但未来若需要在 middleware（`src/proxy.ts` 所在的 Edge 层）做服务端拦截，`jose` 不需要替换。验签时 MUST 固定允许的签名算法（如 `HS256`），拒绝 `alg=none` 与算法降级攻击。

### 决策二：JWT 密钥独立配置，未设置时从 ENCRYPTION_KEY 经 Web Crypto 派生

新增可选环境变量 `JWT_SECRET`。当未配置时，从现有 `ENCRYPTION_KEY` 通过 HKDF 派生出一个独立的签名密钥，而非直接复用。派生 MUST 使用 Web Crypto（`crypto.subtle.importKey` + `deriveBits`），与 `jose` 的 Edge 兼容性保持一致，不使用 Node 专属的 `crypto.hkdfSync`。派生使用固定的 info 标签（`"autorouter-jwt-v1"`）保证确定性，使 JWT 签名密钥与数据加密密钥在密码学上相互隔离，单一密钥泄露不会同时危及两个安全域。当 `JWT_SECRET` 与 `ENCRYPTION_KEY` 均缺失时，JWT 工具 MUST 快速失败（抛配置错误），与 `encryption.ts` 现有 fail-fast 风格一致，绝不以空值派生出可预测密钥。

```
JWT_SECRET 已配置 ──► 直接作为签名密钥
JWT_SECRET 未配置 + ENCRYPTION_KEY 存在 ──► HKDF-WebCrypto(ENCRYPTION_KEY, info="autorouter-jwt-v1")
两者皆缺失 ──► 抛配置错误，拒绝签发/验证
```

### 决策三：统一鉴权工具返回"认证主体"抽象，角色以查库为准

引入 `authenticate(request)` 工具函数，返回一个 `AuthPrincipal` 判别联合类型，统一三种身份来源：

```
type AuthPrincipal =
  | { kind: "admin_token" }                                  // ADMIN_TOKEN 引导身份，视为超级管理员
  | { kind: "user"; userId: string; role: "admin" | "member"; username: string }
  | null                                                      // 未认证

// 角色门禁封装
requireAdmin(request)  → AuthPrincipal | 401/403   // admin_token 或 role=admin 的 user 通过
requireUser(request)   → AuthPrincipal | 401       // 任意已认证身份通过，返回主体供数据隔离使用
```

`ADMIN_TOKEN` 身份被建模为 `kind: "admin_token"`，在所有需要 admin 权限的地方等价于 `role: "admin"` 的用户。ADMIN_TOKEN 的比较 MUST 使用 `crypto.timingSafeEqual`（先处理长度不等的短路），避免现状 `===` 比较的时序侧信道——本变更把它抬升为超级管理员，这条路径的权限价值更高，借重写一并加固。

对 `kind: "user"` 的 JWT，`authenticate` 在验签通过后 MUST 查库取该用户当前记录，校验 `is_active`，并以**查库得到的最新 `role`** 作为鉴权依据，而非信任 JWT payload 中签发时的 role——这样管理员把某 admin 降级为 member 后，旧 token 立即失去 admin 权限。`admin_token` 身份不对应任何用户记录，MUST NOT 触发这次查库。

74 个现有 route 把内联的 `validateAdminAuth(authHeader)` 替换为 `requireAdmin(request)`，迁移是机械的同构替换，行为向后兼容——原本能通过 `ADMIN_TOKEN` 的请求仍然通过，新增的是 `role=admin` 用户也能通过。`requireUser` 返回的认证主体携带 `userId`，是阶段二全部用户侧端点做数据隔离的唯一依据。迁移完成后 MUST 以简单字面 pattern grep `validateAdminAuth` 确认 `src/app/api/admin/` 下无残留，并决定是否清退无调用方的 `withAdminAuth` 死代码。

考虑过沿用 `withAdminAuth` HOC 包裹模式，但 74 个 route 的函数签名各异（部分带 `params`、部分是多方法），统一包裹会引入大量签名适配。采用在函数体首行调用 `requireAdmin` 的内联模式，与现有代码风格一致，迁移成本最低。

### 决策四：首个管理员通过 ADMIN_TOKEN 引导，最后一个 admin 受锁定保护

系统不预置任何用户记录。部署后管理员用 `ADMIN_TOKEN` 登录（保留现有登录方式），进入用户管理页面创建第一个 `role=admin` 用户，此后即可用用户名密码登录。`ADMIN_TOKEN` 永久保留为紧急通道，即使数据库中所有用户被停用，仍可通过它恢复访问。

为防止管理员把自己锁死在系统外，服务端 MUST 拒绝停用或删除"系统中最后一个仍处于启用状态的 admin 用户"。`ADMIN_TOKEN` 作为额外兜底，即便该保护被绕过也能恢复。这一约束写入 admin-user-management spec 作为可验收场景。

### 决策五：密码哈希复用 bcrypt，附加强度与用户名归一化

用户密码沿用 `auth.ts` 中已有的 bcrypt 方案（`BCRYPT_ROUNDS=12`），与 API Key 哈希保持同一套实现，不引入 argon2 等新依赖。密码明文仅在登录、创建用户、改密、重置密码端点的内存中短暂存在，绝不落库、绝不记入日志。创建用户、重置密码、自助改密三处 MUST 统一校验密码最小长度（不少于 8 个字符）。

用户名作为登录标识，存储与唯一性比较 MUST 归一化为小写，使 `ZhangSan` 与 `zhangsan` 视为同一账号，避免大小写造成的重复账号与登录歧义。用户名是不要求可达的唯一账号标识，与显示名分离：用户名用于登录，显示名用于界面友好称呼。

### 决策六：前端存 JWT 字符串，解码 payload 仅取展示信息且容错

`AuthProvider` 继续用 `sessionStorage`，存储项从纯 token 字符串变为 JWT。前端对 JWT 的 payload 做**仅解码不验签**的解析，取出 `role` 用于 UI 渲染（按角色过滤导航）。真正的权限校验始终在服务端进行，前端解码仅服务于展示，不作为安全边界。解码逻辑 MUST 对畸形、无 payload、结构非预期的 token 容错——解码失败时退化为"未认证 principal"并触发登出，绝不抛错导致 `AuthProvider` 白屏。

现有 `AuthProvider` 通过 `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` 直读 sessionStorage，并手动 `dispatchEvent(StorageEvent)` 驱动更新，含 `isHydrated` 门控与 `handleUnauthorized` 401 处理。升级时 principal MUST 由 token 快照派生并缓存（memo 化），保持 `getSnapshot` 返回值稳定，避免每次渲染重算导致 `useSyncExternalStore` 无限循环；并复用既有的 `handleUnauthorized` 与 `isHydrated` 逻辑，而非改写为 `useState`。

JWT payload 只携带鉴权必需的 `userId` 与 `role`，**不放入用户名**——JWT 仅签名不加密，payload 可被任意持有者 base64 解码，用户名属于可避免的信息暴露。展示所需的 `username` 与 `displayName` 由登录响应体返回，并提供 `GET /api/auth/me` 端点按当前 token 返回当前用户资料。`ADMIN_TOKEN` 登录时不产生 JWT，前端用特殊的 bootstrap 主体标记（`{ kind: "admin_token" }`）表示超级管理员身份。

```
AuthContext 结构演进：

旧： { token: string | null, setToken, logout, apiClient }

新： {
       token: string | null,                    // JWT 或 ADMIN_TOKEN
       principal: {                              // 由 token 派生并缓存
         kind: "admin_token" | "user",
         role: "admin" | "member",
         username?: string,                      // 来自 /api/auth/me 或登录响应，非 JWT payload
         displayName?: string,
       } | null,
       login(username, password),                // 调用 /api/auth/login
       loginWithAdminToken(token),               // 保留旧探针式登录
       logout,                                    // 清 sessionStorage 凭据
       apiClient,
     }
```

关于会话存储的权衡：`sessionStorage` 中的 JWT 可被任意 XSS 脚本读取外带，等于会话劫持。本变更把暴露面从"单个运维 token"扩大为"每个用户的会话 token"。选择 `sessionStorage` + Bearer 头而非 httpOnly cookie，是因为后台管理类应用的管理接口走 Bearer 头，改用 cookie 会引入 CSRF 面并需要配套 SameSite / CSRF token。这是已知且接受的工程权衡，前提是前端输出严格转义、第三方脚本受控，并以较短的 JWT 过期时间作为缓解。后续若接入第三方登录或显著扩大用户规模，再评估迁移 httpOnly cookie。

### 决策七：用户侧端点服务端强制数据隔离，事实表冗余 user_id 保证归属稳健

阶段二的 `/api/user/*` 全部用 `requireUser` 取得当前 `userId`，并在数据查询层强制注入 `user_id = <当前用户>` 过滤条件，而非依赖前端传入的用户标识。任何用户侧端点都 MUST NOT 接受"查询任意 userId"的参数，越权访问在服务端被截断。

个人用量与请求记录复用现有 `request_logs` / `request_billing_snapshots`，但**给这两张事实表各新增一个冗余 `user_id` 列**，在写入请求记录与账单快照时从该请求所用密钥的当前归属快照填入。个人用量直接基于该冗余列聚合，不再实时 join `api_keys`。这样做解决两个否则无法回避的正确性问题：其一，`member` 删除（硬删除）自己的密钥后，历史请求记录因冗余 `user_id` 仍归属到该用户，不会因密钥消失而丢失；其二，停用或删除用户后，其历史用量仍可被管理员按用户查询。冗余列对存量数据为 NULL，属合法的"历史无归属"状态。

考虑过让用户侧端点复用 admin 端点并加一层过滤，但 admin 端点默认返回全量数据，一旦过滤遗漏即造成越权，风险集中且难以审计。独立的 `/api/user/*` 端点从设计上就只能看到自己的数据，默认安全。

### 决策八：member 自助密钥管理的权限边界（已固定，不再是 Open Question）

`member` 在自助门户中可以对归属于自己的 API Key 执行创建、更新、停用、启用、删除，以及配置该密钥自身的消费限额规则。边界约束在服务端强制执行：

新建密钥的 `user_id` 强制设为当前用户，`member` MUST NOT 修改密钥归属（更新密钥时忽略任何传入的 `user_id`，不能转让、不能认领无归属或他人密钥）、MUST NOT 操作不属于自己的密钥。

member 自助创建的密钥 `access_mode` 强制为 `restricted`（不允许 `unrestricted`，否则按现有默认会触达全部上游，构成提权），且其授权上游集合 MUST 是"管理员对该用户开放的上游集合"的子集。该集合由新增的 `user_upstreams` 关联表承载，管理员在用户管理侧配置（决策九的数据模型）。服务端拒绝 member 授权任何超出该集合的上游。

`spending_rules` 的自助配置 MUST NOT 被 member 用于放宽成本约束：member 只能收紧（调低或细化）自身密钥的限额，MUST NOT 把限额调高到超过管理员为该用户设定的上限，也 MUST NOT 清空已有限额。由于 design 的 Non-Goals 把 per-key `spending_rules` 定为唯一成本控制手段，放宽限额等于额度提权，必须在服务端拦截。管理员为用户设定的限额上限随 `user_upstreams` 一并配置或作为用户级字段，第一版可取"该用户名下任一密钥的限额不得低于管理员设定的下限额度"。

### 决策九：按角色分流落地页，抽取公共壳层 AppShell

登录后依据角色决定落地位置：`admin` 与 `admin_token` 进入现有管理后台（`(dashboard)` 路由组），`member` 进入自助门户（新增 `(portal)` 路由组）。`member` 直接访问管理后台路由时，客户端守卫将其重定向到门户，服务端管理接口同时返回 403 兜底。

现有壳层 `(dashboard)/layout.tsx` 强依赖 `LivePulseProvider`（实时脉冲是管理后台概念）、`MobilePulseStrip`，并按 `MOBILE_ROOT_ROUTES`（dashboard / keys / upstreams / logs / settings）硬编码移动端根路由判断。门户不需要这些。因此 MUST 先抽取一个不含 `LivePulseProvider`、不含管理后台移动根路由集合的公共 `AppShell` 组件，由 `(dashboard)` 与 `(portal)` 两个路由组各自的 layout 分别包裹各自的 Provider 与导航集合，而非让门户直接复用管理后台 layout。这是一次明确的结构抽取，列为门户阶段的显式任务，避免在"复制 layout"与"重构 layout"之间反复。

`sidebar.tsx` 现有三个独立数组 `navigation` / `systemNavigation` / `mobileNavigation`，各有独立的 `labelKey` 联合类型，移动端底栏写死 `grid-cols-5`。角色分流统一在门户阶段一次性处理：管理后台沿用现有三数组（阶段一仅向 `systemNavigation` 追加"用户管理"入口），门户引入一套全新的导航集合（个人概览 / 我的请求 / 我的密钥），其移动端变体 MUST 适配为对应列数的栅格而非沿用 `grid-cols-5`。

### 决策十：停用用户连带其名下密钥在代理侧失效

代理入口 `/api/proxy/v1/*` 现状只校验 client API key 自身的 `is_active` 与 bcrypt，不回查密钥归属用户的状态。本变更约定：当一个 API Key 归属于某个已被停用的用户时，该密钥 MUST 在代理侧被拒绝，使"停用用户"成为即时、连带其全部密钥失效的操作，而非仅阻止登录。实现上在密钥校验路径增加对 owner `users.is_active` 的判定（可通过 join 或一次附加查询）。无归属（`user_id` 为 NULL）的密钥不受影响，行为与现状一致。这条作为 user-portal / user-entity spec 的可验收场景。

### 决策十一：登录端点失败限流

`POST /api/auth/login` MUST 对登录失败实施速率限制，按用户名与来源 IP 维度做失败计数与短时锁定（滑动窗口），防止在线撞库；同时缓解大量并发登录请求触发 bcrypt 计算放大形成的 CPU 拒绝服务。现有代码库无通用限流中间件，第一版可实现为最简单的内存级计数器，但限流要求本身在 spec 中固化为 MUST，并补对应测试。

## 数据模型设计

### users 表（pg 与 sqlite 同步新增）

| 列名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK，随机生成 | 主键 |
| `username` | varchar(255) | UNIQUE，NOT NULL | 登录标识，存储与比较归一化为小写 |
| `password_hash` | varchar(128) | NOT NULL | bcrypt 哈希 |
| `display_name` | varchar(255) | NOT NULL | 显示名 |
| `role` | varchar(16) | NOT NULL，default `'member'` | `admin` 或 `member` |
| `is_active` | boolean | NOT NULL，default `true` | 账号是否可登录；停用连带名下密钥代理失效 |
| `created_at` | timestamp | NOT NULL | 创建时间 |
| `updated_at` | timestamp | NOT NULL | 更新时间 |

SQLite 侧时间戳沿用项目既有约定写法（`integer(..., { mode: "timestamp_ms" }).notNull().defaultNow()`），主键沿用 `text().$defaultFn(() => randomUUID())`，与全表风格一致，不引入 drizzle 官方默认写法造成漂移。

### user_upstreams 关联表（pg 与 sqlite 同步新增）

| 列名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `user_id` | uuid | NOT NULL，references users(id) | 用户 |
| `upstream_id` | uuid | NOT NULL，references upstreams(id) | 该用户可授权给自助密钥的上游 |

承载"管理员对该用户开放的上游集合"，member 自助创建密钥的授权上游 MUST 是该集合子集。沿用现有 `api_key_upstreams` 的关联表模式。

### api_keys 表变更

`user_id` 列保持 nullable（存量密钥无归属属于合法状态），新增外键约束 `references users(id)` 与索引 `idx_api_keys_user_id`。外键删除行为采用 `ON DELETE SET NULL`。

### request_logs 与 request_billing_snapshots 表变更

各新增一个冗余 `user_id` 列（nullable uuid，建索引），写入时从该请求所用密钥的当前归属快照填入，个人用量据此聚合（见决策七）。

### 删除用户的事务原子性

删除用户与名下密钥归属置空 MUST 在单个数据库事务内原子完成。PostgreSQL 可依赖 `ON DELETE SET NULL`；SQLite 客户端当前不启用外键约束（见 Context 表），其归属置空 MUST 由 service 层在同一事务内显式 `UPDATE api_keys SET user_id=NULL` 后再 `DELETE user`，避免与"该用户并发自助新建密钥"形成 TOCTOU 导致悬挂归属。这与仓库既有的 TOCTOU 教训一致。

## 认证流程

### 登录流程

```
┌──────────┐  username+password  ┌─────────────────────┐
│ 登录页面 │ ──────────────────► │ POST /api/auth/login│
└──────────┘                     └──────────┬──────────┘
                                            │ 0. 失败限流检查（用户名 / IP）
                                            │ 1. 查 users by 归一化用户名
                                            │ 2. is_active 校验
                                            │ 3. bcrypt.compare 密码
                                            │ 4. 签发 JWT(userId, role)  ← 不含用户名
                                            ▼
┌──────────┐  { token, user }    ┌─────────────────────┐
│ 登录页面 │ ◄────────────────── │      200 OK         │
└────┬─────┘  失败统一 401        └─────────────────────┘
     │ 存入 sessionStorage
     ▼
 按 role 分流：admin → 管理后台 / member → 自助门户
```

### 请求鉴权流程

```
请求携带 Authorization: Bearer <token>
        │
        ▼
   authenticate(request)
        │
        ├─ timingSafeEqual(token, ADMIN_TOKEN) ─► { kind: "admin_token" }  （不查库）
        │
        ├─ jose.jwtVerify(token, 固定算法) 成功 ─► 查 users：is_active + 取最新 role
        │                                          └─► { kind: "user", role(最新), userId }
        │
        └─ 都不匹配 / 验签失败 ─────────────────► null
                │
                ├─ requireAdmin：admin_token / 最新 role=admin 放行，member→403，null→401
                └─ requireUser ：任意已认证放行并返回 userId，null→401
                                          │
                                          ▼
                            用户侧查询强制 user_id 过滤
```

## 前端布局示意

### 登录页双模式（文件位于 (auth)/login/page.tsx）

```
┌─────────────────────────────────────────┐
│              AutoRouter 登录              │
│   ┌─────────────┬─────────────────────┐  │
│   │ 账号登录(默认)│  管理员令牌登录       │  │  ← 模式切换标签
│   └─────────────┴─────────────────────┘  │
│   用户名 [ ____________________ ]          │
│   密码   [ ____________________ ]          │
│            [      登 录      ]             │
└─────────────────────────────────────────┘
切到"管理员令牌登录"标签时仅显示单个令牌输入框，沿用现有探针式验证逻辑。
```

### 用户管理页面（管理后台 · 阶段一）

```
┌────────────────────────────────────────────────────────┐
│  用户管理                              [ + 新建用户 ]     │
├────────────────────────────────────────────────────────┤
│  用户名      显示名          角色    状态   密钥数  操作   │
│  zhangsan    张三           admin  启用   3      ⋯      │
│  lisi        李四           member 启用   1      ⋯      │
└────────────────────────────────────────────────────────┘
列表分页；操作菜单(⋯)：编辑资料 / 改用户名 / 重置密码 / 停用·启用 /
                       配置可用上游 / 分配密钥 / 删除
最后一个启用的 admin 的停用·删除入口禁用并提示
```

### 自助门户（阶段二 · 仅 member 可见）

```
┌──────────────┬───────────────────────────────────────────┐
│  我的门户     │  个人概览                                  │
│ ▸ 个人概览   │  今日请求 1,240   本月费用 $12.50          │
│   我的请求   │  活跃密钥 2       本月调用 38,900          │
│   我的密钥   │  ┌─ 近 7 日用量趋势 ──────────────────┐    │
│   修改密码   │  │      ▁▂▄▆█▅▃                        │    │
│              │  └────────────────────────────────────┘    │
└──────────────┴───────────────────────────────────────────┘
我的请求：仅当前用户名下密钥产生的记录（基于事实表冗余 user_id）
我的密钥：新建 / 编辑额度（仅可收紧）/ 停启 / 删除，上游授权限定在
          管理员开放集合内，归属与越权操作在服务端被拦截
```

### 导航按角色分流（共用抽取后的 AppShell）

```
role = admin / admin_token            role = member
┌─────────────────┐                   ┌─────────────────┐
│ 仪表盘          │                   │ 个人概览        │
│ API 密钥        │                   │ 我的请求        │
│ 上游            │                   │ 我的密钥        │
│ 日志            │                   │ 修改密码        │
│ 系统            │                   └─────────────────┘
│  ├ … 既有项     │                   移动端栅格按 4 项适配，
│  └ 用户管理 ◄新 │                   不沿用 grid-cols-5
└─────────────────┘
```

## Risks / Trade-offs

**[前端解码 JWT 不验签可能被误认为安全边界]** → 代码注释与 specs 明确：前端解码仅用于 UI 展示，所有权限校验在服务端基于 `authenticate` 重新验证；解码对畸形 token 容错退化为未认证，不崩溃。

**[74 个 route 批量迁移引入回归]** → 同构替换，`admin_token` 主体保证 `ADMIN_TOKEN` 行为不变；补覆盖三类身份的鉴权测试，迁移后 grep 核验无残留并运行现有 admin route 测试套件。

**[用户侧端点数据越权]** → 阶段二最高风险。所有 `/api/user/*` 强制服务端 `userId` 注入过滤，禁止外部传入 userId；为个人请求记录、用量、密钥列表分别编写"用户 A 无法读 B 数据"的越权测试，作为验收硬指标。

**[member 自助密钥提权]** → 强制 `access_mode=restricted`、授权上游限定 `user_upstreams` 子集、`spending_rules` 仅可收紧、归属不可改；为"授权越界上游被拒""放宽限额被拒""转移归属被忽略"分别编写测试。

**[停用用户后名下密钥仍可代理]** → 决策十在代理校验路径回查 owner `is_active`，停用即连带密钥失效；为"停用用户后其密钥代理被拒"编写测试。

**[最后一个 admin 自锁定]** → 服务端拒绝停用/删除最后一个启用 admin，`ADMIN_TOKEN` 作额外兜底。

**[JWT 角色变更窗口]** → `authenticate` 以查库最新 role 为准，降级即时生效；为"admin 降级后旧 token 无法通过 requireAdmin"编写测试。

**[登录撞库与 bcrypt CPU 放大]** → 决策十一登录失败限流。

**[ADMIN_TOKEN 时序侧信道]** → 改用 `timingSafeEqual`。

**[SQLite 外键不强制]** → SQLite 客户端当前不启用外键约束，新增外键在 SQLite 下仅声明性。删除用户置空名下密钥 `user_id` 由 service 层在事务内显式完成，不依赖 SQLite 外键；归属相关测试在 SQLite 与 PostgreSQL 两种 dbType 下都覆盖。

**[SQLite 与 PostgreSQL schema 漂移]** → `users`、`user_upstreams`、`api_keys` 外键、两张事实表冗余列必须在 `schema-pg.ts` 与 `schema-sqlite.ts` 同步定义，分别生成迁移，`pnpm db:check:consistency` 验证一致性。

**[会话存储 XSS 暴露面]** → sessionStorage + Bearer 是已知接受的权衡（见决策六），前提是前端无 XSS，以短 JWT 过期时间缓解。

## Migration Plan

数据库迁移均为向后兼容的加法变更：新增 `users`、`user_upstreams` 表，给 `api_keys.user_id` 加外键与索引，给 `request_logs` / `request_billing_snapshots` 加冗余 `user_id` 列与索引。存量数据的相关字段保持 NULL，属合法的"无归属/历史无归属"状态，不阻塞代理流程。

部署后系统无任何用户记录，管理员用现有 `ADMIN_TOKEN` 登录创建首个 admin 用户。整个过程不需要停机，旧的 `ADMIN_TOKEN` 登录方式在前后端都保留。

分批交付：阶段一任务组（1–8）完成后即构成可独立合并发布的完整功能；阶段二任务组（9–13）在其上叠加。两阶段建议拆成两个可独立合并的 PR——阶段一的"鉴权基础设施 + 74 route 迁移"本身是高回归风险的独立重构，与阶段二的门户性质不同，分 PR 便于评审与回滚，符合仓库既有的分阶段提交习惯。

回滚策略：本变更不删除或修改任何现有列，回滚只需还原代码；新增表、外键、冗余列可保留（不影响旧逻辑）或通过 down 迁移移除。

## Open Questions

JWT 过期时间的具体取值（24 小时为初始建议）与是否提供"记住登录"的长期 refresh token，可在实现阶段依据使用体验确定，不阻塞本设计。

管理员为用户设定的成本上限（决策八中 `spending_rules` 收紧约束所依赖的天花板）以哪种粒度存储——挂在用户记录上的单一下限额度，还是更细的按周期上限——在阶段二实现前依据管理侧 UI 复杂度确定；第一版取最简单的单一下限额度，不阻塞模型主体。
