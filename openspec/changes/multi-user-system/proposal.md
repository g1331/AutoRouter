## Why

当前系统的认证模型是单一 `ADMIN_TOKEN` 静态令牌——全部 74 个 admin route 采用相同的内联鉴权，登录页只有一个密码输入框，`AuthProvider` 只区分"有 token / 无 token"两态。这种设计无法区分不同操作者的身份，无法按用户维度隔离数据访问，也无法支撑普通用户自助查看用量和管理密钥的场景。

`api_keys` 表的 `user_id` 字段已预留（nullable uuid，无外键），`request_logs` 和 `request_billing_snapshots` 通过 `api_key_id` 具备向用户维度聚合的数据通道。基础设施条件成熟，需要引入用户实体、角色感知的认证体系，以及面向普通用户的自助门户来激活这些预留能力。

本变更覆盖 Issue #109 的完整目标，分为两个内聚阶段：用户体系基础能力（用户实体、认证、角色鉴权、管理员用户管理）和用户自助门户（个人数据隔离、自助密钥管理、门户页面）。两个阶段共享同一套数据模型与认证机制，门户直接建立在基础能力之上，因此放在同一个变更中交付，通过分阶段的任务分组保留分批提交的节奏。

关联 Issue: #109

## What Changes

**阶段一 · 用户体系基础能力**

- 新增 `users` 表，包含用户名、密码哈希、显示名、角色（`admin` / `member`）、账号激活状态
- 给 `api_keys.user_id` 添加外键约束和索引，建立密钥到用户的归属关系
- 引入基于 JWT 的认证机制，新增 `POST /api/auth/login` 端点，返回携带 userId、role、exp 的 JWT
- `ADMIN_TOKEN` 保留为系统引导入口和紧急维护通道，与 JWT 共存
- 将 74 个 admin route 的内联 `validateAdminAuth` 统一为角色感知的鉴权工具函数
- 新增管理员用户管理 API：用户 CRUD、分配/回收 API Key 所有权、配置用户可用上游集合（`user_upstreams`）
- 最后一个启用的管理员受锁定保护，禁止停用或删除从而把自己锁在系统之外
- 前端登录页扩展为支持用户名+密码登录（保留 ADMIN_TOKEN 登录方式）
- `AuthProvider` 从纯 token 字符串升级为携带用户信息（userId、role、displayName）的结构
- 管理后台新增用户管理页面

**阶段二 · 用户自助门户**

- 新增 `/api/user/*` 用户侧端点，服务端强制将数据访问范围限定为当前登录用户
- 普通用户自助管理归属于自己的 API Key：在授权范围内创建、更新、停用、删除，授权上游限定为管理员开放集合、额度仅可收紧
- 普通用户可在门户内自助修改自己的密码
- 停用用户连带其名下密钥在代理侧即时失效
- 个人用量与请求记录复用现有 `request_logs` 与 `request_billing_snapshots`，并给两张事实表新增冗余 `user_id` 列，保证密钥删除或用户停用后历史用量仍可按用户聚合
- 新增自助门户页面：个人概览、个人请求记录、个人 API Key 管理、修改密码
- 导航与路由按角色区分：管理员进入管理后台，普通用户进入自助门户，两者复用抽取后的公共壳层

## Capabilities

### New Capabilities

- `user-entity`: 用户数据模型——users 表定义、角色枚举、账号状态管理、密码哈希存储
- `user-auth`: 用户认证机制——JWT 签发/验证、登录端点、ADMIN_TOKEN 共存策略、角色感知鉴权中间件
- `admin-user-management`: 管理员用户管理——用户 CRUD API、API Key 所有权分配/回收、管理后台用户管理页面
- `user-portal`: 用户自助门户——用户侧数据隔离、个人用量与请求记录查询、自助 API Key 管理、门户页面与角色路由

### Modified Capabilities

- `admin-console-layout-v2`: 导航系统按角色区分管理后台与自助门户两套入口，侧边栏菜单项扩展

## Impact

**数据库**：`schema-pg.ts` 和 `schema-sqlite.ts` 新增 `users` 表与 `user_upstreams` 关联表，`api_keys` 表新增外键约束和索引，`request_logs` 与 `request_billing_snapshots` 各新增冗余 `user_id` 列与索引；需要生成两套方言迁移文件

**后端 API**：新增 `/api/auth/login`、`/api/auth/me` 端点；新增 `/api/admin/users/` 路由组与用户可用上游配置接口；新增 `/api/user/*` 用户侧路由组（强制数据隔离，含自助密钥管理与自助改密）；代理入口 `/api/proxy/v1/*` 的密钥校验新增对归属用户激活状态的回查；全部现有 admin route 的鉴权调用方式变更（从内联 `validateAdminAuth` 迁移到统一工具函数）

**前端**：`auth-provider.tsx` 认证状态结构变更（principal 派生与缓存、解码容错、登出）；`(auth)/login/page.tsx` 新增用户名字段和登录模式切换；从 `(dashboard)/layout.tsx` 抽取公共 `AppShell`；新增 `(portal)` 路由组；`sidebar.tsx` 按角色渲染管理后台或门户导航并适配移动端栅格；新增用户管理页面与自助门户各页面组件

**依赖**：新增 JWT 库（`jose`）

**配置**：新增 `JWT_SECRET` 环境变量（未配置时从 `ENCRYPTION_KEY` 经 Web Crypto 派生，两者皆缺失则 fail-fast）；`config.ts` Zod schema 扩展
